// ─────────────────────────────────────────────────────────────────────────────
// POST /api/travel/extract — "here is a link or some text, what places are in
// it?"
//
// This is the read half of the importer. It NEVER writes: nothing here touches
// trip_plans, destination_places or itinerary_places. The traveler sees what
// was found, ticks what they want, and app/api/travel/places/import writes it.
// Splitting the two is what makes a wrong guess free — a bad extraction costs
// the traveler a glance, not a cleanup.
//
// The pipeline, in order, each stage falling back rather than failing:
//
//   1. Pull the first URL out of whatever was pasted (share sheets hand over
//      caption and link as one blob).
//   2. A Google Maps link resolves to exact coordinates — no model, no
//      guessing. This is the highest-quality path and it is tried first.
//   3. A social link is asked for its caption via lib/travel/linkPreview.ts.
//      Instagram and Facebook usually refuse us; that is reported honestly so
//      the UI can ask for the caption text instead.
//   4. The caption (fetched, or pasted directly) goes to the model
//      (lib/travel/placeAgent.ts) and, if it is not configured or does not
//      answer, to the deterministic extractor (lib/travel/placeExtraction.ts).
//   5. Places without coordinates get geocoded, rate-limited and capped.
//
// Every stage is allowed to come back empty. An empty list with a reason the UI
// can explain beats an error page.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { requireUser } from '@/lib/serverAuth';
import { log } from '@/lib/logger';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';
import { allowedMapsUrl, resolveFinalUrl, TOTAL_TIMEOUT_MS } from '@/lib/travel/mapsResolve';
import { classifyLink, firstUrlIn, textWithoutUrls, type LinkPlatform } from '@/lib/travel/socialLink';
import { fetchLinkPreview, type LinkPreview } from '@/lib/travel/linkPreview';
import { extractWithModel, placeAgentConfigured } from '@/lib/travel/placeAgent';
import {
  extractFromCaption,
  guessDestination,
  inferCategory,
  MAX_CANDIDATES,
  normaliseCandidate,
  type PlaceCandidate,
} from '@/lib/travel/placeExtraction';
import { geocodePlace, geocodingConfigured, MAX_LOOKUPS_PER_IMPORT } from '@/lib/travel/geocode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * A model call plus a geocoding pass with a one-second floor between lookups
 * runs past the 10s default. The traveler is watching a progress screen, so the
 * budget is raised rather than the work being cut short halfway.
 */
export const maxDuration = 60;

const payload = z
  .object({
    /** A URL, a caption, or a share blob containing both. */
    input: z.string().trim().min(1).max(10_000),
    /** A city or country the traveler already has in mind. Only ever a hint. */
    destinationHint: z.string().trim().max(80).optional(),
  })
  .strict();

/**
 * Why the answer is empty, when it is. Each of these gets its own sentence in
 * front of the traveler, because "Instagram would not show us the caption" and
 * "there are no places in this post" are entirely different problems with
 * entirely different next steps.
 */
export type ExtractOutcome =
  | 'ok'
  | 'no-places-found'
  | 'caption-unavailable'
  | 'link-unreadable';

export interface ExtractResponse {
  outcome: ExtractOutcome;
  platform: LinkPlatform | null;
  /** What we read, echoed back so the traveler can see we got the right post. */
  preview: {
    title: string | null;
    author: string | null;
    thumbnailUrl: string | null;
    canonicalUrl: string | null;
  } | null;
  candidates: PlaceCandidate[];
  /** The country every candidate agrees on, when they do. Pre-selects the trip. */
  destination: string | null;
  /**
   * Which halves of the pipeline were available. The UI states this plainly
   * rather than pretending an unconfigured deployment is a smart one.
   */
  capabilities: { model: boolean; geocoding: boolean };
}

export const POST = route(async (request, context) => {
  const user = await requireUser(request);

  // Same reasoning as the maps-link route: this is an endpoint that turns a
  // user's string into outbound connections and, where a key is set, into model
  // tokens. It gets the tightest tier we have, in a bucket of its own so it
  // cannot lock a traveler out of signing in.
  const verdict = checkRateLimit(request, 'auth', `extract:${user.id}`);
  if (!verdict.ok) {
    throw new ApiError('RATE_LIMITED', 'Too many imports at once. Please wait a moment.', {
      retryAfterSeconds: verdict.retryAfterSeconds,
      limit: RATE_LIMITS.auth.limit,
    });
  }

  const parsed = payload.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    throw new ApiError('BAD_REQUEST', 'Paste a link or some text to import from.');
  }

  const { input, destinationHint } = parsed.data;
  const capabilities = { model: placeAgentConfigured(), geocoding: geocodingConfigured() };

  const link = firstUrlIn(input);
  const classified = link ? classifyLink(link) : null;

  // ── 1. A Google Maps link is one exact place. No model, no geocoder. ───────
  if (classified?.platform === 'google-maps') {
    const resolved = await placeFromMapsLink(link as string, destinationHint);
    return ok<ExtractResponse>(
      {
        outcome: resolved ? 'ok' : 'link-unreadable',
        platform: 'google-maps',
        preview: { title: null, author: null, thumbnailUrl: null, canonicalUrl: classified.canonicalUrl },
        candidates: resolved ? [resolved] : [],
        destination: resolved?.country ?? null,
        capabilities,
      },
      { requestId: context.requestId }
    );
  }

  // ── 2. A social link: ask the platform for the caption. ───────────────────
  let preview: LinkPreview | null = null;
  if (classified) {
    preview = await fetchLinkPreview(classified.canonicalUrl);
  }

  // What the traveler pasted around the link is worth reading too: someone who
  // copies a whole post gets the caption for free even when the platform
  // refuses us.
  const pastedText = textWithoutUrls(input);
  const caption = [preview?.caption, preview?.title === preview?.caption ? null : preview?.title, pastedText]
    .filter((part): part is string => Boolean(part && part.trim()))
    // The same string can arrive from both the platform and the paste.
    .filter((part, index, all) => all.indexOf(part) === index)
    .join('\n\n')
    .trim();

  const previewBlock = classified
    ? {
        title: preview?.title ?? null,
        author: preview?.author ?? null,
        thumbnailUrl: preview?.thumbnailUrl ?? null,
        canonicalUrl: classified.canonicalUrl,
      }
    : null;

  if (!caption) {
    // Nothing to read at all. Which sentence the traveler gets depends on why.
    const outcome: ExtractOutcome =
      preview?.outcome === 'blocked' || preview?.outcome === 'unsupported'
        ? 'caption-unavailable'
        : classified
          ? 'link-unreadable'
          : 'no-places-found';
    log.info('extract.empty_caption', {
      requestId: context.requestId,
      platform: classified?.platform ?? 'text',
      previewOutcome: preview?.outcome ?? 'none',
    });
    return ok<ExtractResponse>(
      {
        outcome,
        platform: classified?.platform ?? null,
        preview: previewBlock,
        candidates: [],
        destination: null,
        capabilities,
      },
      { requestId: context.requestId }
    );
  }

  // ── 3. Read the caption: model first, deterministic extractor as the floor. ─
  const hint = destinationHint ?? guessDestination(caption)?.label ?? null;
  const fromModel = await extractWithModel({
    caption,
    title: preview?.title ?? null,
    destinationHint: hint,
  });
  // `null` means the model could not be asked or did not answer, so fall
  // through. An empty ARRAY means it read the caption and there is nothing in
  // it — that is an answer, and second-guessing it with regexes would put the
  // fragments it correctly rejected in front of the traveler.
  const candidates = fromModel ?? extractFromCaption(caption);

  // ── 4. Put pins on what we can. ───────────────────────────────────────────
  const located = await addCoordinates(candidates, hint);

  const destination = agreedDestination(located);

  log.info('extract.done', {
    requestId: context.requestId,
    platform: classified?.platform ?? 'text',
    usedModel: fromModel !== null,
    found: located.length,
  });

  return ok<ExtractResponse>(
    {
      outcome: located.length ? 'ok' : 'no-places-found',
      platform: classified?.platform ?? null,
      preview: previewBlock,
      candidates: located,
      destination,
      capabilities,
    },
    { requestId: context.requestId }
  );
}, { name: 'travel.extract' });

/**
 * A Google Maps link as a single candidate.
 *
 * Confidence 0.95, and never less: these coordinates came out of the URL Google
 * itself produced. The only uncertainty is the name, which Maps sometimes omits.
 */
async function placeFromMapsLink(
  link: string,
  destinationHint?: string
): Promise<PlaceCandidate | null> {
  const start = allowedMapsUrl(link);
  if (!start) return null;

  try {
    const chain = await resolveFinalUrl(start, Date.now() + TOTAL_TIMEOUT_MS);
    const place = parseGoogleMapsUrl(chain.url.toString());
    if (!place) return null;

    const name = place.name ?? 'Dropped pin';
    return normaliseCandidate(
      {
        name,
        description: '',
        category: inferCategory(name),
        city: destinationHint ?? null,
        country: null,
        lat: place.lat,
        lng: place.lng,
        confidence: 0.95,
        source: 'maps-link',
      },
      destinationHint ? guessDestination(destinationHint) : null
    );
  } catch {
    // resolveFinalUrl throws ApiError for a dead or hostile link. The importer
    // reports it as an unreadable link rather than a 400, because the traveler
    // has another way in — paste the name — and an error page hides it.
    return null;
  }
}

/**
 * Geocode the candidates that have no pin yet.
 *
 * Serial and capped, because the public Nominatim instance permits one request
 * per second and this is where a fifteen-place carousel would otherwise fire
 * fifteen at once. Highest-confidence candidates are geocoded first, so when
 * the cap bites it bites on the guesses.
 */
async function addCoordinates(
  candidates: PlaceCandidate[],
  hint: string | null
): Promise<PlaceCandidate[]> {
  if (!geocodingConfigured()) return candidates;

  const ordered = [...candidates].sort((a, b) => b.confidence - a.confidence);
  let budget = MAX_LOOKUPS_PER_IMPORT;
  const located = new Map<string, { lat: number; lng: number }>();

  for (const candidate of ordered) {
    if (budget <= 0) break;
    if (candidate.lat !== null && candidate.lng !== null) continue;
    budget -= 1;
    const hit = await geocodePlace(candidate.name, {
      city: candidate.city ?? hint,
      country: candidate.country,
    });
    if (hit) located.set(candidate.name, { lat: hit.lat, lng: hit.lng });
  }

  return candidates
    .map((candidate) => {
      const hit = located.get(candidate.name);
      return hit ? { ...candidate, lat: hit.lat, lng: hit.lng } : candidate;
    })
    .slice(0, MAX_CANDIDATES);
}

/**
 * The one country every located candidate belongs to, or null.
 *
 * Null when they disagree — a "best of Asia" post really does span four
 * countries, and picking one of them would file eight places onto the wrong
 * trip. The traveler chooses instead.
 */
function agreedDestination(candidates: PlaceCandidate[]): string | null {
  const countries = new Set(
    candidates.map((candidate) => candidate.country).filter((country): country is string => Boolean(country))
  );
  return countries.size === 1 ? [...countries][0] : null;
}
