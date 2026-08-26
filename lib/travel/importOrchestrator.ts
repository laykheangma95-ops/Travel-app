// ─────────────────────────────────────────────────────────────────────────────
// Turning a QUEUED job into a COMPLETED or FAILED one.
//
// WHAT THIS IS FOR:
//   Phase 3 (lib/travel/importIntake.ts) records that a traveler pasted a
//   link. Nothing then read it — that gap is this file. It claims a queued
//   job, asks the registered connector (lib/connectors/places/registry.ts)
//   to read the link, sanitizes what comes back
//   (lib/travel/connectorBoundary.ts), and runs the SAME caption pipeline
//   app/api/travel/extract already uses (the model, then the deterministic
//   extractor, then the geocoder) — so a link read through the queue and a
//   link read through the synchronous importer produce candidates the same
//   way, validated by the same `normaliseCandidate` door.
//
// ONE STATE MACHINE, NOT TWO. This never invents a status
// place_imports.status doesn't already have (migration 015): queued →
// processing → completed | failed. `needs_confirmation` stays reserved for a
// future connector that can signal genuine ambiguity; nothing here produces
// it yet, and nothing here is required to.
//
// WHY CLAIMING IS ONE CONDITIONAL UPDATE:
//   `UPDATE ... WHERE status = 'queued' ... RETURNING` is how the traveler's
//   own double-tap of "process" — or, later, two workers reaching for the same
//   row — resolves without a lock of our own: Postgres serializes the two
//   UPDATEs, exactly one of them matches `status = 'queued'`, and the loser
//   gets zero rows back rather than a corrupted job. The same pattern Phase 3
//   used for the open-job partial index, just expressed as a WHERE clause
//   instead of a constraint because this is a state transition, not a new row.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getConnectorFor } from '@/lib/connectors/places/registry';
import { ConnectorError, type ConnectorExtraction } from '@/lib/connectors/places/types';
import { sanitizeConnectorResult } from './connectorBoundary';
import { recordAiUsage } from './aiUsage';
import {
  assertWithinProcessingQuota,
  completeImportIfProcessing,
  failImportWithReason,
  type ImportOutcome,
} from './importJobs';
import {
  dedupeCandidates,
  extractFromCaption,
  guessDestination,
  inferCategory,
  MAX_CANDIDATES,
  normaliseCandidate,
  type PlaceCandidate,
} from './placeExtraction';
import { extractWithModel } from './placeAgent';
import { geocodePlace, geocodingConfigured, MAX_LOOKUPS_PER_IMPORT } from './geocode';
import { parseSafeUrl } from './urlSafety';
import type { LinkPlatform } from './socialLink';

export type ProcessOutcome = 'completed' | 'failed' | 'already-processing' | 'not-found';

export interface ProcessResult {
  outcome: ProcessOutcome;
  status: string | null;
  importOutcome: ImportOutcome | null;
  candidateCount: number;
}

interface ClaimedJob {
  id: string;
  platform: string;
  normalizedUrl: string | null;
  originalUrl: string | null;
}

/**
 * Move a job from `queued` to `processing`, or find out someone already did.
 *
 * Scoped to `user_id = userId` on top of the caller's session client's own RLS
 * policy — belt and braces, since this is exactly the boundary a forged job id
 * would test first.
 */
async function claimQueuedImport(
  supabase: SupabaseClient,
  userId: string,
  importId: string
): Promise<ClaimedJob | null> {
  const { data, error } = await supabase
    .from('place_imports')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', importId)
    .eq('user_id', userId)
    .eq('status', 'queued')
    .select('id,platform,normalized_url,original_url')
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { id: string; platform: string; normalized_url: string | null; original_url: string | null };
  return { id: row.id, platform: row.platform, normalizedUrl: row.normalized_url, originalUrl: row.original_url };
}

/** The job's current status, for a caller that lost the claim race. */
async function currentStatus(
  supabase: SupabaseClient,
  userId: string,
  importId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('place_imports')
    .select('status')
    .eq('id', importId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { status: string }).status;
}

/** Geocode candidates with no pin. Mirrors the addCoordinates helper in
 *  app/api/travel/extract/route.ts — same cap, same serial-with-a-gap
 *  rationale (the public Nominatim instance permits one request/second). */
async function addCoordinates(candidates: PlaceCandidate[], hint: string | null): Promise<PlaceCandidate[]> {
  if (!geocodingConfigured()) return candidates;

  const ordered = [...candidates].sort((a, b) => b.confidence - a.confidence);
  let budget = MAX_LOOKUPS_PER_IMPORT;
  const located = new Map<string, { lat: number; lng: number; resultCount: number }>();

  for (const candidate of ordered) {
    if (budget <= 0) break;
    if (candidate.lat !== null && candidate.lng !== null) continue;
    budget -= 1;
    const hit = await geocodePlace(candidate.name, { city: candidate.city ?? hint, country: candidate.country });
    if (hit) located.set(candidate.name, { lat: hit.lat, lng: hit.lng, resultCount: hit.resultCount });
  }

  return candidates
    .map((candidate) => {
      const hit = located.get(candidate.name);
      return hit
        ? { ...candidate, lat: hit.lat, lng: hit.lng, geocodeResultCount: hit.resultCount }
        : candidate;
    })
    .slice(0, MAX_CANDIDATES);
}

/**
 * The connector's own candidate names, folded in alongside the caption
 * pipeline's output.
 *
 * These are already-sanitized strings (lib/travel/connectorBoundary.ts), not
 * yet PlaceCandidate values — they still go through `normaliseCandidate`,
 * the same single door every other candidate source uses, so a connector
 * cannot hand through a category, a coordinate or a confidence the rest of
 * the pipeline has not validated.
 *
 * WHY `source` AND `confidence` ARE PARAMETERS RATHER THAN CONSTANTS:
 *   They were hardcoded to `'model'` and `0.5`, and the Phase 4 review proved
 *   what that cost. A Google Maps link arrived as
 *   `{lat: null, lng: null, confidence: 0.5, extraction_source: 'model'}` —
 *   three separate defects in one row. `'model'` is a lie no model told, and
 *   migration 012 leans on that column meaning something exact: "'model' is
 *   the only one that costs". `0.5` sits below AUTO_SELECT_CONFIDENCE (0.55),
 *   so Domner's single most reliable input arrived un-ticked in the review
 *   list. And the exact pin the connector had already resolved was dropped on
 *   the floor, to be re-guessed by the geocoder.
 *
 * `coordinates` is applied only when the connector named exactly ONE place.
 * A single pin spread across several names would put every one of them at the
 * same wrong spot, which is worse than having no pin at all.
 */
function candidatesFromNames(
  names: string[],
  destination: ReturnType<typeof guessDestination>,
  options: {
    source: PlaceCandidate['source'];
    confidence: number;
    coordinates: { lat: number; lng: number } | null;
  }
): PlaceCandidate[] {
  const pin = names.length === 1 ? options.coordinates : null;

  return names
    .map((name) =>
      normaliseCandidate(
        {
          name,
          description: '',
          category: inferCategory(name),
          city: destination?.label ?? null,
          country: destination?.country ?? null,
          lat: pin?.lat ?? null,
          lng: pin?.lng ?? null,
          confidence: options.confidence,
          source: options.source,
        },
        destination
      )
    )
    .filter((entry): entry is PlaceCandidate => entry !== null);
}

/**
 * Read a claimed job's link and produce candidates, without writing anything.
 * Split out so the SUCCESS path below has one place to build a job's outcome.
 */
async function runConnector(
  connectorId: string,
  platform: LinkPlatform,
  extraction: ConnectorExtraction
): Promise<{
  outcome: ImportOutcome;
  candidates: PlaceCandidate[];
  preview: { title: string | null; author: string | null; thumbnailUrl: string | null; canonicalUrl: string | null };
  usedModel: boolean;
  usage: Awaited<ReturnType<typeof extractWithModel>>['usage'];
}> {
  const sanitized = sanitizeConnectorResult(extraction);

  const preview = {
    title: sanitized.title,
    author: null,
    thumbnailUrl: sanitized.thumbnailUrl,
    canonicalUrl: sanitized.sourceUrl || null,
  };

  const destination = sanitized.captionText ? guessDestination(sanitized.captionText) : null;

  if (!sanitized.captionText && sanitized.candidateNames.length === 0) {
    // A Maps link that resolved but named nothing is unreadable, not merely
    // caption-less — there was never a caption to have. Everything else with
    // nothing to read gets the sentence that tells the traveler to paste the
    // caption text instead (mirrors ExtractOutcome in app/api/travel/extract).
    const outcome: ImportOutcome = platform === 'google-maps' ? 'link-unreadable' : 'caption-unavailable';
    return { outcome, candidates: [], preview, usedModel: false, usage: null };
  }

  const fromModel = sanitized.captionText
    ? await extractWithModel({ caption: sanitized.captionText, title: sanitized.title })
    : { candidates: null, usage: null };
  const fromCaption = sanitized.captionText
    ? (fromModel.candidates ?? extractFromCaption(sanitized.captionText))
    : [];
  const fromConnector = candidatesFromNames(sanitized.candidateNames, destination, {
    // A resolved Google Maps link is an exact pin the platform itself produced
    // — the same `'maps-link'` provenance and high confidence
    // app/api/travel/extract has always recorded for it. Any other connector's
    // names were read off the post without a model call, which is what
    // `'caption'` means; calling them `'model'` would put a cost against a
    // call that never happened.
    source: platform === 'google-maps' ? 'maps-link' : 'caption',
    confidence: sanitized.confidence,
    coordinates: sanitized.coordinates,
  });

  const merged = dedupeCandidates([...fromCaption, ...fromConnector]);
  const located = await addCoordinates(merged, destination?.label ?? null);

  log.info('import_orchestrator.extracted', {
    connectorId,
    usedModel: fromModel.candidates !== null,
    found: located.length,
  });

  return {
    outcome: located.length ? 'ok' : 'no-places-found',
    candidates: located,
    preview,
    usedModel: fromModel.candidates !== null,
    usage: fromModel.usage,
  };
}

/**
 * Claim a queued job and run it to completion.
 *
 * Idempotent by construction: a job already `processing`, `completed` or
 * `failed` is reported as such rather than re-run — the caller (the "process"
 * route, possibly a double-tapped one) gets back the job's real state either
 * way. Ownership is enforced by RLS on the caller's session client AND by the
 * explicit `user_id` check in claimQueuedImport, so a forged id belonging to
 * another traveler reads as `not-found`.
 */
export async function processImport(
  supabase: SupabaseClient,
  userId: string,
  importId: string
): Promise<ProcessResult> {
  // The cap that guards money, checked BEFORE the claim so an over-quota
  // traveler's job stays `queued` and can simply be processed tomorrow rather
  // than being burned to `failed`. See assertWithinProcessingQuota: the intake
  // quota counts rows a traveler can forge through PostgREST, so it cannot be
  // the cap on spend; this counts runs actually performed, at the one point
  // that no request can reach except through this function.
  await assertWithinProcessingQuota(supabase, userId);

  const claimed = await claimQueuedImport(supabase, userId, importId);
  if (!claimed) {
    const status = await currentStatus(supabase, userId, importId);
    if (!status) return { outcome: 'not-found', status: null, importOutcome: null, candidateCount: 0 };
    // Covers every reason the claim did not match: another call already
    // completed or failed it, another call is mid-claim right now (status
    // still reads 'queued' for an instant), or the id belongs to a job that
    // was never queued at all. The caller treats all of these as "come back
    // and check", never as an error.
    return { outcome: 'already-processing', status, importOutcome: null, candidateCount: 0 };
  }

  // Defense in depth: re-validate the stored URL before any connector touches
  // it. The intake already ran parseSafeUrl once; this catches a row written
  // by a future code path that skipped it, or a policy that has tightened
  // since the row was created.
  //
  // `originalUrl` first, deliberately: `normalizedUrl` (lib/travel/urlHash.ts)
  // is a comparison key, not a fetchable address — it has the scheme stripped
  // on purpose so http:// and https:// versions of one post hash the same.
  // Re-parsing it here would refuse every row, scheme-first, for a reason that
  // has nothing to do with safety.
  const url = claimed.originalUrl ?? claimed.normalizedUrl;
  const verdict = url ? parseSafeUrl(url) : { ok: false as const, code: 'malformed' as const };
  if (!verdict.ok) {
    await failImportWithReason(supabase, importId, 'unsafe_url', 'This link is no longer considered safe to read.');
    return { outcome: 'failed', status: 'failed', importOutcome: null, candidateCount: 0 };
  }

  const platform = claimed.platform as LinkPlatform;
  const connector = getConnectorFor(platform);
  if (!connector) {
    await failImportWithReason(
      supabase,
      importId,
      'no_connector',
      'Domner cannot read this platform yet.'
    );
    return { outcome: 'failed', status: 'failed', importOutcome: null, candidateCount: 0 };
  }

  let extraction: ConnectorExtraction;
  try {
    extraction = await connector.extract({ url: verdict.url.toString(), platform });
  } catch (error) {
    const message =
      error instanceof ConnectorError
        ? error.message
        : error instanceof Error
          ? error.message.slice(0, 160)
          : 'The connector failed.';
    log.warn('import_orchestrator.connector_failed', { connectorId: connector.id, platform, message });
    await failImportWithReason(supabase, importId, 'connector_error', message);
    return { outcome: 'failed', status: 'failed', importOutcome: null, candidateCount: 0 };
  }

  const result = await runConnector(connector.id, platform, extraction);

  // The cost ledger is written whatever happens to the job row below: the
  // tokens were spent even if the reaper has since given up on this job, and a
  // ledger that omits spend it could not attribute is a ledger that understates
  // the bill.
  if (result.usage) {
    const admin = getSupabaseAdmin();
    if (admin) await recordAiUsage(admin, userId, 'place_import', result.usage);
  }

  const won = await completeImportIfProcessing(supabase, importId, {
    outcome: result.outcome,
    candidates: result.candidates,
    usedModel: result.usedModel,
    preview: result.preview,
  });

  if (!won) {
    // Something reached a terminal status while the connector was working —
    // in practice the reaper deciding this job was stuck. Its verdict stands;
    // migration 016 would refuse to overwrite it in any case.
    const status = await currentStatus(supabase, userId, importId);
    log.warn('import_orchestrator.completion_lost', { importId, status });
    return { outcome: 'already-processing', status, importOutcome: null, candidateCount: 0 };
  }

  return {
    outcome: 'completed',
    status: 'completed',
    importOutcome: result.outcome,
    candidateCount: result.candidates.length,
  };
}
