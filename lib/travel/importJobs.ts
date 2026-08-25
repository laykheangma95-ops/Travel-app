// ─────────────────────────────────────────────────────────────────────────────
// The importer's memory.
//
// WHAT THIS IS FOR:
//   /api/travel/extract used to be perfectly stateless: classify, fetch, ask a
//   model, geocode, answer, forget. Forgetting is what made the same link cost
//   the same money every time it was pasted, and what left a saved place with
//   no record of the post it came from.
//
//   This module gives that pipeline a row. Nothing about what the traveler sees
//   changes; what changes is that a repeat is recognised.
//
// THE ONE RULE HERE: BOOKKEEPING MUST NEVER COST THE TRAVELER THEIR IMPORT.
//   Every function below either returns null or swallows its error and logs.
//   If Supabase is down, unconfigured, or the migration has not been applied,
//   the importer keeps working exactly as it did before this file existed — it
//   simply stops remembering. The single exception is the quota, which is a
//   refusal by design and says so.
//
// WHY EVERY FUNCTION TAKES `supabase`:
//   Same reason as lib/travel/placeImport.ts. These run on the CALLER'S session
//   client, so RLS confines a traveler to their own imports. Handing a
//   service_role client to anything here would switch all of that off (rule 3),
//   and would also make the quota meaningless.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/http';
import { log } from '@/lib/logger';
import { isUniqueViolation } from '@/lib/supabaseError';
import type { ItineraryCategory } from './itinerary';
import type { PlaceCandidate } from './placeExtraction';
import type { LinkPlatform } from './socialLink';
import type { ImportKey } from './urlHash';

/** How a stored import names where it came from. `text` is a caption paste. */
export type ImportPlatform = LinkPlatform | 'text';

/**
 * The job vocabulary, as of migration 015.
 *
 *   queued              recorded by the intake, waiting for a connector
 *   processing          work has started            (migration 012: 'extracting')
 *   needs_confirmation  extracted, waiting on the traveler
 *   completed           finished, results reusable  (migration 012: 'ready')
 *   failed              finished, and did not work
 *
 * The two old spellings are still accepted by the CHECK constraint and still
 * present in the reuse queries below, because rows written by an earlier
 * release carry them and a rolled-back deploy would write them again. They are
 * deprecated, not gone.
 */
export type ImportStatus =
  | 'queued'
  | 'processing'
  | 'needs_confirmation'
  | 'completed'
  | 'failed';

/** Every spelling of "this import finished and its result can be replayed". */
export const COMPLETED_STATUSES = ['completed', 'ready'] as const;

/** Mirrors ExtractOutcome in the route. Kept as a string union, not an import,
 *  so this module does not depend on a route file. */
export type ImportOutcome = 'ok' | 'no-places-found' | 'caption-unavailable' | 'link-unreadable';

/**
 * Imports one account may run in a rolling day before being asked to wait.
 *
 * WHY A DATABASE COUNT AND NOT lib/rateLimit.ts:
 *   That limiter is an in-process Map. On Vercel every serverless instance has
 *   its own, so a traveler who happens to land on eight instances gets eight
 *   allowances. That is fine for a burst courtesy limit — which is what it is,
 *   and it stays in front of this — and useless as a spending cap.
 *
 * 40 is deliberately generous: a traveler planning a trip in one sitting may
 * genuinely paste twenty reels, and a quota that fires on real use is a bug
 * report rather than a control. It is the runaway account this stops.
 */
const DEFAULT_DAILY_QUOTA = 40;

export function dailyImportQuota(): number {
  const raw = Number(process.env.PLACE_IMPORT_DAILY_QUOTA);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_DAILY_QUOTA;
  return Math.floor(raw);
}

/** A candidate as it comes back out of the database on a replay. */
export interface StoredCandidate extends PlaceCandidate {}

/**
 * What the traveler was shown about the post itself. Stored on the job row so a
 * replay renders the same screen as the first import rather than a bare list.
 */
export interface ImportPreview {
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  canonicalUrl: string | null;
}

export interface ReusableImport {
  importId: string;
  outcome: ImportOutcome;
  candidates: StoredCandidate[];
  preview: ImportPreview | null;
}

/**
 * A stored preview back into application shape.
 *
 * Every field is checked rather than trusted: this is jsonb, so the database
 * enforces only that it is an object. A stored preview from an older revision
 * of the code must degrade to nulls, never to `undefined` leaking into the
 * response the review screen reads.
 */
function toPreview(value: unknown): ImportPreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof raw[key] === 'string' && raw[key] ? (raw[key] as string) : null;
  const preview = {
    title: text('title'),
    author: text('author'),
    thumbnailUrl: text('thumbnailUrl'),
    canonicalUrl: text('canonicalUrl'),
  };
  // All-null is the same as having no preview, and saying so keeps the replay
  // response identical to a first import that had none.
  return Object.values(preview).some((entry) => entry !== null) ? preview : null;
}

interface CandidateRow {
  name: string;
  description: string | null;
  category: string;
  city: string | null;
  country: string | null;
  lat: number | string | null;
  lng: number | string | null;
  confidence: number | string | null;
  extraction_source: string;
}

const CATEGORIES: ItineraryCategory[] = ['spot', 'food', 'shopping', 'transport', 'stay', 'other'];
const SOURCES: PlaceCandidate['source'][] = ['maps-link', 'model', 'caption'];

/**
 * A stored row back into the shape the route already returns.
 *
 * Everything is re-validated on the way out rather than trusted. These rows
 * were written by an earlier version of this code, and "our own database wrote
 * it" is exactly the assumption that turns a schema change into a crash in
 * front of a traveler.
 */
function toCandidate(row: CandidateRow): StoredCandidate {
  const category = CATEGORIES.includes(row.category as ItineraryCategory)
    ? (row.category as ItineraryCategory)
    : 'other';
  const source = SOURCES.includes(row.extraction_source as PlaceCandidate['source'])
    ? (row.extraction_source as PlaceCandidate['source'])
    : 'model';
  const number = (value: number | string | null): number | null => {
    if (value === null) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    name: row.name,
    description: row.description ?? '',
    category,
    city: row.city,
    country: row.country,
    lat: number(row.lat),
    lng: number(row.lng),
    confidence: number(row.confidence) ?? 0,
    source,
  };
}

/**
 * The traveler's own completed extraction of this exact link, if there is one.
 *
 * DELIBERATELY OWN-USER ONLY. Reusing another traveler's extraction would save
 * more money — a viral link is imported by many people — but reading their row
 * means going around RLS with the service role, and that is a decision with a
 * privacy argument attached rather than a free win. It is written up in
 * docs/SOCIAL-SAVE.md as a Phase 2 question, not smuggled in here.
 *
 * Null on any failure. A cache that errors is a cache that is skipped.
 */
export async function findReusableImport(
  supabase: SupabaseClient,
  userId: string,
  urlHash: string
): Promise<ReusableImport | null> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .select('id,outcome,preview')
      .eq('user_id', userId)
      .eq('url_hash', urlHash)
      // Both spellings: a row written before migration 015 says 'ready'.
      .in('status', COMPLETED_STATUSES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as { id: string; outcome: ImportOutcome | null; preview: unknown };
    // An import that found nothing is still worth replaying: re-running the
    // model to be told "no places" a second time is the same bill for the same
    // answer. Only a row with no recorded outcome is treated as unusable.
    if (!row.outcome) return null;

    const { data: candidateRows, error: candidateError } = await supabase
      .from('import_candidates')
      .select('name,description,category,city,country,lat,lng,confidence,extraction_source')
      .eq('import_id', row.id)
      .order('position', { ascending: true });

    if (candidateError) return null;

    return {
      importId: row.id,
      outcome: row.outcome,
      candidates: ((candidateRows ?? []) as CandidateRow[]).map(toCandidate),
      preview: toPreview(row.preview),
    };
  } catch {
    return null;
  }
}

/**
 * Every status spelling this function might read back, folded onto the
 * current vocabulary. Not trusted as an enum straight off the row for the
 * same reason toCandidate() re-validates category and source: the database
 * enforces the CHECK constraint, not this module's idea of what a valid value
 * is, and a value this code does not recognise is treated as `failed` rather
 * than handed to a client that will poll it forever waiting for a status that
 * will never arrive.
 */
function normaliseStatus(value: string): ImportStatus {
  if ((['queued', 'processing', 'needs_confirmation', 'completed', 'failed'] as const).includes(
    value as ImportStatus
  )) {
    return value as ImportStatus;
  }
  if (value === 'extracting') return 'processing';
  if (value === 'ready') return 'completed';
  return 'failed';
}

/** What GET /api/imports/:id has to answer with, for the queued-job review flow. */
export interface ImportJobSnapshot {
  status: ImportStatus;
  outcome: ImportOutcome | null;
  candidates: StoredCandidate[];
  preview: ImportPreview | null;
  /** Mirrors the synchronous pipeline's `capabilities.model` — whether the
   *  model actually ran for this job, so the review screen can show the same
   *  "reading captions without AI" hint it already shows there. False (not
   *  null) for a job with no outcome yet, matching the column's own default. */
  usedModel: boolean;
}

/**
 * A queued job's current state, by id — the read side of the connector
 * layer's `processImport()` (lib/travel/importOrchestrator.ts).
 *
 * OWN-ROW ONLY, the same as everything else here: the caller's session client
 * carries RLS (`place_imports_select_own`, `import_candidates_owner`), and
 * this adds no `service_role` path around it. A foreign or forged id reads as
 * null — the route above turns that into 404, never into another traveler's
 * job.
 *
 * Candidates are only worth reading once the job is `completed` — a job still
 * `queued`, `processing`, `needs_confirmation` or `failed` has nothing in
 * `import_candidates` yet (or, for `failed`, nothing that was ever written).
 * Returning an empty list for those rather than querying is one fewer request
 * on every poll.
 */
export async function loadImportForReview(
  supabase: SupabaseClient,
  userId: string,
  importId: string
): Promise<ImportJobSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .select('status,outcome,preview,used_model')
      .eq('id', importId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as {
      status: string;
      outcome: ImportOutcome | null;
      preview: unknown;
      used_model: boolean | null;
    };
    const status = normaliseStatus(row.status);
    const usedModel = row.used_model === true;

    if (status !== 'completed') {
      return { status, outcome: row.outcome, candidates: [], preview: null, usedModel };
    }

    const { data: candidateRows, error: candidateError } = await supabase
      .from('import_candidates')
      .select('name,description,category,city,country,lat,lng,confidence,extraction_source')
      .eq('import_id', importId)
      .order('position', { ascending: true });

    return {
      status,
      outcome: row.outcome,
      candidates: candidateError ? [] : ((candidateRows ?? []) as CandidateRow[]).map(toCandidate),
      preview: toPreview(row.preview),
      usedModel,
    };
  } catch {
    return null;
  }
}

/**
 * Refuse a traveler who has run the pipeline more times today than the quota
 * allows. Replays do not count — they cost nothing, so charging for them would
 * punish exactly the behaviour this whole phase is trying to encourage.
 *
 * FAILS OPEN. If the count cannot be read, the import proceeds. A database
 * hiccup that locked every traveler out of the importer would be a worse
 * outage than the spending it was guarding against, and the burst limiter in
 * front of this is still holding.
 */
export async function assertWithinQuota(supabase: SupabaseClient, userId: string): Promise<void> {
  const quota = dailyImportQuota();
  if (quota === 0) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabase
      .from('place_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('reused_from_import_id', null)
      .gte('created_at', since);

    if (error || count === null || count === undefined) return;

    if (count >= quota) {
      log.warn('import_job.quota_exceeded', { userId, count, quota });
      throw new ApiError(
        'RATE_LIMITED',
        'You have imported a lot of places today. Please try again tomorrow.',
        { limit: quota }
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Anything else is the count failing, not the traveler being over it.
    log.warn('import_job.quota_unreadable', { userId });
  }
}

/**
 * Every status meaning "this row has already consumed a pipeline run".
 *
 * `queued` is deliberately absent: a queued row has been recorded and has cost
 * nothing yet. The two deprecated spellings are present because a row written
 * by a pre-Phase-3 release spent a model call just the same.
 */
const PROCESSED_STATUSES = ['processing', 'completed', 'failed', 'extracting', 'ready'] as const;

/**
 * Refuse a traveler who has already had the quota's worth of imports PROCESSED
 * today. This is the cap that guards money.
 *
 * WHY THIS EXISTS SEPARATELY FROM assertWithinQuota:
 *   That one runs at intake and counts rows created. It was the whole cost
 *   control until Phase 4, and Phase 4's review found the gap: a traveler
 *   holds the anon key, and `place_imports_insert_own` lets them INSERT their
 *   own rows straight through PostgREST. Creating a thousand `queued` rows
 *   that way never passes through createImportFromUrl, so the intake count is
 *   never consulted — and each of those rows would then buy a connector run
 *   and a model call.
 *
 *   Rows a traveler can forge cannot be the cap. The cap has to sit at the
 *   point of SPEND, and that point is reachable only through our own server:
 *   there is no PostgREST route to a connector or to Anthropic. So the count
 *   here is of runs actually performed, checked immediately before performing
 *   another one.
 *
 * IT DOES NOT DOUBLE-CHARGE. The intake counts rows created; this counts rows
 * processed. A traveler who legitimately queues forty links and processes all
 * forty passes both: at the fortieth, thirty-nine have been processed.
 *
 * FAILS OPEN, exactly like assertWithinQuota, and for the same reason: a
 * database hiccup that locked every traveler out of the importer would be a
 * worse outage than the spending it was guarding against.
 */
export async function assertWithinProcessingQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const quota = dailyImportQuota();
  if (quota === 0) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabase
      .from('place_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      // A replay served from an earlier import ran no pipeline, so it is not
      // spend — the same exclusion the intake quota makes, and the guard
      // trigger is what stops the marker being forged (migration 012).
      .is('reused_from_import_id', null)
      .in('status', PROCESSED_STATUSES as unknown as string[])
      .gte('created_at', since);

    if (error || count === null || count === undefined) return;

    if (count >= quota) {
      log.warn('import_job.processing_quota_exceeded', { userId, count, quota });
      throw new ApiError(
        'RATE_LIMITED',
        'You have imported a lot of places today. Please try again tomorrow.',
        { limit: quota }
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    log.warn('import_job.processing_quota_unreadable', { userId });
  }
}

export interface StartImportInput {
  userId: string;
  key: ImportKey | null;
  platform: ImportPlatform;
}

/**
 * Open a job row. Returns its id, or null when it could not be written.
 *
 * Null is a normal outcome, not an error: an empty `.env` has no database, and
 * the importer must still work there (CLAUDE.md §11). Every function below
 * accepts a null id and does nothing with it.
 */
export async function startImport(
  supabase: SupabaseClient,
  input: StartImportInput
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .insert({
        user_id: input.userId,
        url_hash: input.key?.urlHash ?? null,
        normalized_url: input.key?.normalizedUrl ?? null,
        platform: input.platform,
        status: 'processing',
      })
      .select('id')
      .single();

    if (error || !data) {
      log.warn('import_job.start_failed', { reason: error?.message?.slice(0, 120) ?? 'no row' });
      return null;
    }
    return (data as { id: string }).id;
  } catch (error) {
    log.warn('import_job.start_threw', {
      reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    return null;
  }
}

export interface CompleteImportInput {
  outcome: ImportOutcome;
  candidates: PlaceCandidate[];
  usedModel: boolean;
  /** What the traveler was shown about the post. Replayed verbatim. */
  preview?: ImportPreview | null;
  /** Set when this import answered from an earlier one. */
  reusedFromImportId?: string | null;
}

/** Close a job row and store what it found. Best-effort, like everything here. */
export async function completeImport(
  supabase: SupabaseClient,
  importId: string | null,
  input: CompleteImportInput
): Promise<void> {
  if (!importId) return;

  try {
    if (input.candidates.length > 0) {
      const rows = input.candidates.map((candidate, index) => ({
        import_id: importId,
        name: candidate.name,
        description: candidate.description,
        category: candidate.category,
        city: candidate.city,
        country: candidate.country,
        lat: candidate.lat,
        lng: candidate.lng,
        confidence: candidate.confidence,
        extraction_source: candidate.source,
        position: index,
      }));
      const { error } = await supabase.from('import_candidates').insert(rows);
      if (error) log.warn('import_job.candidates_failed', { reason: error.message.slice(0, 120) });
    }

    await supabase
      .from('place_imports')
      .update({
        status: 'completed',
        outcome: input.outcome,
        candidate_count: input.candidates.length,
        used_model: input.usedModel,
        preview: input.preview ?? null,
        reused_from_import_id: input.reusedFromImportId ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importId);
  } catch (error) {
    log.warn('import_job.complete_threw', {
      reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
  }
}

/**
 * Close a job the connector layer claimed — but only if it is still the one
 * holding the claim.
 *
 * SIBLING OF completeImport, NOT A REPLACEMENT. That function is what
 * app/api/travel/extract has always called and its behaviour is unchanged;
 * this is the queue path's variant, in the same style as
 * failImportWithReason above.
 *
 * WHAT THE `status = 'processing'` FILTER IS FOR:
 *   The Phase 4 review reproduced this: the reaper decides a long-running job
 *   is stuck and marks it `failed`, then the connector finishes and writes
 *   `completed` over the top — leaving a row that reads `completed` while
 *   still carrying `error_code = 'stuck_timeout'` and a cancellation message.
 *   Migration 016 refuses that write at the database, which is the real fix;
 *   this filter means the losing side never attempts it, so the orchestrator
 *   can report what actually happened instead of logging a swallowed error.
 *
 * Returns false when the claim was lost, and the caller then writes nothing
 * else: candidates are only inserted AFTER the terminal transition is won, so
 * a reaped job never accumulates the results of the run that outlived it.
 */
export async function completeImportIfProcessing(
  supabase: SupabaseClient,
  importId: string,
  input: CompleteImportInput
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .update({
        status: 'completed',
        outcome: input.outcome,
        candidate_count: input.candidates.length,
        used_model: input.usedModel,
        preview: input.preview ?? null,
        // A job that succeeded carries no failure. Clearing these matters
        // because a retry of a previously-failed link would otherwise inherit
        // the old row's error text.
        error_code: null,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importId)
      .eq('status', 'processing')
      .select('id');

    if (error) {
      log.warn('import_job.complete_guarded_failed', { reason: error.message.slice(0, 160) });
      return false;
    }
    // Zero rows means something else reached a terminal status first — the
    // reaper, or a concurrent call. Not an error, and not ours to overwrite.
    if (!data || (data as unknown[]).length === 0) {
      log.warn('import_job.complete_lost_claim', { importId });
      return false;
    }

    if (input.candidates.length > 0) {
      const rows = input.candidates.map((candidate, index) => ({
        import_id: importId,
        name: candidate.name,
        description: candidate.description,
        category: candidate.category,
        city: candidate.city,
        country: candidate.country,
        lat: candidate.lat,
        lng: candidate.lng,
        confidence: candidate.confidence,
        extraction_source: candidate.source,
        position: index,
      }));
      const { error: candidateError } = await supabase.from('import_candidates').insert(rows);
      if (candidateError) {
        log.warn('import_job.candidates_failed', { reason: candidateError.message.slice(0, 120) });
      }
    }

    return true;
  } catch (error) {
    log.warn('import_job.complete_guarded_threw', {
      reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown',
    });
    return false;
  }
}

/** Mark a job as failed. Used when the pipeline throws, so the row is not left open. */
export async function failImport(supabase: SupabaseClient, importId: string | null): Promise<void> {
  if (!importId) return;
  try {
    await supabase
      .from('place_imports')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', importId);
  } catch {
    // Nothing useful to do. The row stays 'processing', which is itself a
    // readable signal that an extraction died halfway.
  }
}

/** Closed vocabulary for `place_imports.error_code`, set by the connector orchestrator. */
export type ImportErrorCode =
  | 'no_connector'
  | 'connector_error'
  | 'unsafe_url'
  | 'stuck_timeout';

/**
 * Mark a job as failed with a reason, for a human or the UI to read back.
 *
 * Additive to `failImport` above, not a replacement: that function is used by
 * the existing synchronous pipeline (app/api/travel/extract) and its callers
 * are unchanged. This is for the queue orchestration added in Phase 4, which
 * has a reason worth recording — `error_code`/`error_message` were added by
 * migration 015 for exactly this and have had no writer until now.
 */
export async function failImportWithReason(
  supabase: SupabaseClient,
  importId: string,
  code: ImportErrorCode,
  message: string
): Promise<void> {
  try {
    await supabase
      .from('place_imports')
      .update({
        status: 'failed',
        error_code: code,
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', importId)
      // Only the holder of the claim may record the verdict. Without this, a
      // connector that fails after the reaper already gave up on the job would
      // overwrite `stuck_timeout` with its own error — `failed` → `failed`
      // leaves the status unchanged, so migration 016 permits it and only this
      // filter keeps the first, true verdict.
      .eq('status', 'processing');
  } catch (error) {
    log.warn('import_job.fail_with_reason_threw', {
      reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
  }
}

export interface ImportProvenance {
  platform: ImportPlatform;
  key: ImportKey;
}

/**
 * The link an import job was opened for, read back from the job row.
 *
 * The SAVE request does not carry the source URL, deliberately. The client
 * already told us the link once, when it asked for the extraction; asking it
 * again would mean trusting a caller to say which post a place came from, and
 * provenance a caller can dictate is not provenance. RLS confines this lookup
 * to the traveler's own jobs, so an id belonging to someone else reads as null.
 */
export async function loadImportProvenance(
  supabase: SupabaseClient,
  importId: string
): Promise<ImportProvenance | null> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .select('platform,url_hash,normalized_url')
      .eq('id', importId)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as { platform: string; url_hash: string | null; normalized_url: string | null };
    // A text paste has no link, so there is no source to attribute.
    if (!row.url_hash) return null;

    return {
      platform: row.platform as ImportPlatform,
      key: { urlHash: row.url_hash, normalizedUrl: row.normalized_url ?? '' },
    };
  } catch {
    return null;
  }
}

export interface RecordSourceInput {
  placeId: string;
  userId: string;
  importId: string | null;
  platform: ImportPlatform;
  key: ImportKey;
}

/**
 * Record which post a saved place came from.
 *
 * Called only after a place has actually been written, so a source row can
 * never point at a place that does not exist. A duplicate — the same post
 * imported onto the same place twice — is refused by a unique index and
 * swallowed here, because it is not an error: it is the traveler re-importing
 * a post they already saved from.
 */
export async function recordPlaceSource(
  supabase: SupabaseClient,
  input: RecordSourceInput
): Promise<void> {
  try {
    const { error } = await supabase.from('place_sources').insert({
      place_id: input.placeId,
      platform: input.platform,
      normalized_url: input.key.normalizedUrl,
      url_hash: input.key.urlHash,
      submitted_by: input.userId,
      import_id: input.importId,
    });
    // A unique violation means this post is already a source for this place —
    // the traveler re-importing something they already saved. Not an error, and
    // decided by SQLSTATE rather than by the wording of a message.
    if (error && !isUniqueViolation(error)) {
      log.warn('import_job.source_failed', { reason: error.message.slice(0, 120) });
    }
  } catch {
    // Provenance is valuable, but never at the cost of the save itself.
  }
}

/**
 * Mark the candidates a traveler actually kept, and where they landed.
 *
 * This is what turns an import log into training data: the difference between
 * what the model proposed and what a human accepted is the only honest measure
 * of whether the extraction is any good.
 */
export async function markCandidateAccepted(
  supabase: SupabaseClient,
  importId: string | null,
  name: string,
  placeId: string
): Promise<void> {
  if (!importId) return;
  try {
    await supabase
      .from('import_candidates')
      .update({ accepted: true, resolved_place_id: placeId })
      .eq('import_id', importId)
      .eq('name', name);
  } catch {
    // Best-effort, like the rest of the ledger.
  }
}
