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
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
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
import { importKeyFor } from '@/lib/travel/urlHash';
import {
  assertWithinQuota,
  completeImport,
  failImport,
  findReusableImport,
  startImport,
  type ImportPlatform,
} from '@/lib/travel/importJobs';
import { recordAiUsage, type AiUsage } from '@/lib/travel/aiUsage';

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
  /**
   * The job row this extraction was recorded as, or null when the ledger was
   * unavailable. The client hands it back on save so a place can be traced to
   * the post it came from.
   */
  importId: string | null;
  /** True when this answered from an earlier identical import — no model call. */
  reused: boolean;
}

export const POST = route(async (request, context) => {
  const user = await requireUser(request);

  // Same reasoning as the maps-link route: this is an endpoint that turns a
  // user's string into outbound connections and, where a key is set, into model
  // tokens. It gets the tightest tier we have, in a bucket of its own so it
  // cannot lock a traveler out of signing in.
  //
  // This is the BURST limiter and it is per-instance, so it is a courtesy
  // rather than a spending cap. The daily cap is assertWithinQuota below, which
  // counts rows in the database.
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

  // The reuse key. Null when the traveler pasted text with no link in it —
  // free text has no stable identity, so that import is recorded but never
  // replayed. See lib/travel/urlHash.ts.
  const key = importKeyFor(input);

  // Null with an empty .env, and that is a supported state (CLAUDE.md §11):
  // every ledger call below accepts null and does nothing. The importer works
  // without a database, it just stops remembering.
  const supabase = supabaseFromRequest(request);
  const platform = platformOf(input);

  // ── 0. Have we already done exactly this? ─────────────────────────────────
  //
  // The cheapest model call is the one that is not made. A replay costs one
  // indexed SELECT and zero tokens.
  if (supabase && key) {
    const reusable = await findReusableImport(supabase, user.id, key.urlHash);
    if (reusable) {
      const replayId = await startImport(supabase, { userId: user.id, key, platform });
      await completeImport(supabase, replayId, {
        outcome: reusable.outcome,
        candidates: reusable.candidates,
        usedModel: false,
        reusedFromImportId: reusable.importId,
        preview: reusable.preview,
      });
      log.info('extract.reused', {
        requestId: context.requestId,
        platform,
        found: reusable.candidates.length,
      });
      return ok<ExtractResponse>(
        {
          outcome: reusable.outcome,
          platform: platform === 'text' ? null : platform,
          // The post's own title, author and thumbnail, as the first import
          // showed them. A replay that dropped this rendered a different screen
          // for the same link, which reads as a failure rather than as a hit.
          preview: reusable.preview,
          candidates: reusable.candidates,
          destination: agreedDestination(reusable.candidates),
          capabilities,
          importId: replayId,
          reused: true,
        },
        { requestId: context.requestId }
      );
    }

    // Only reached when the pipeline is actually about to run, so a traveler is
    // never refused for imports that cost nothing.
    await assertWithinQuota(supabase, user.id);
  }

  const importId = supabase
    ? await startImport(supabase, { userId: user.id, key, platform })
    : null;

  try {
    const result = await runExtraction(input, destinationHint ?? null, context.requestId);

    if (supabase) {
      // The cost ledger is written with the SERVICE-ROLE client, never the
      // caller's: ai_usage_log has no RLS policy, so a traveler can neither
      // read it nor write it. Null when no service key is configured, and
      // recordAiUsage does nothing with that — an absent line is honest.
      if (result.usage) {
        await recordAiUsage(getSupabaseAdmin(), user.id, 'place_import', result.usage);
      }
      await completeImport(supabase, importId, {
        outcome: result.body.outcome,
        candidates: result.body.candidates,
        usedModel: result.usage !== null,
        preview: result.body.preview,
      });
    }

    return ok<ExtractResponse>(
      { ...result.body, capabilities, importId, reused: false },
      { requestId: context.requestId }
    );
  } catch (error) {
    // The row is not left open on a crash: an 'extracting' row that never
    // completes is indistinguishable from one still in flight.
    if (supabase) await failImport(supabase, importId);
    throw error;
  }
}, { name: 'travel.extract' });

/** How a job row names where this input came from. */
function platformOf(input: string): ImportPlatform {
  const link = firstUrlIn(input);
  const classified = link ? classifyLink(link) : null;
  return classified?.platform ?? 'text';
}

/**
 * The pipeline itself, unchanged in behaviour and now returning what it cost.
 *
 * Split out of the handler so the job-ledger bookkeeping has exactly one place
 * to hook into, rather than a completeImport() call before each of the three
 * places this used to return from.
 */
async function runExtraction(
  input: string,
  destinationHint: string | null,
  requestId: string
): Promise<{ body: Omit<ExtractResponse, 'capabilities' | 'importId' | 'reused'>; usage: AiUsage | null }> {
  const link = firstUrlIn(input);
  const classified = link ? classifyLink(link) : null;

  // ── 1. A Google Maps link is one exact place. No model, no geocoder. ───────
  if (classified?.platform === 'google-maps') {
    const resolved = await placeFromMapsLink(link as string, destinationHint ?? undefined);
    return {
      body: {
        outcome: resolved ? 'ok' : 'link-unreadable',
        platform: 'google-maps',
        preview: { title: null, author: null, thumbnailUrl: null, canonicalUrl: classified.canonicalUrl },
        candidates: resolved ? [resolved] : [],
        destination: resolved?.country ?? null,
      },
      usage: null,
    };
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
      requestId,
      platform: classified?.platform ?? 'text',
      previewOutcome: preview?.outcome ?? 'none',
    });
    return {
      body: {
        outcome,
        platform: classified?.platform ?? null,
        preview: previewBlock,
        candidates: [],
        destination: null,
      },
      usage: null,
    };
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
  const candidates = fromModel.candidates ?? extractFromCaption(caption);

  // ── 4. Put pins on what we can. ───────────────────────────────────────────
  const located = await addCoordinates(candidates, hint);

  log.info('extract.done', {
    requestId,
    platform: classified?.platform ?? 'text',
    usedModel: fromModel.candidates !== null,
    found: located.length,
  });

  return {
    body: {
      outcome: located.length ? 'ok' : 'no-places-found',
      platform: classified?.platform ?? null,
      preview: previewBlock,
      candidates: located,
      destination: agreedDestination(located),
    },
    usage: fromModel.usage,
  };
}

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
