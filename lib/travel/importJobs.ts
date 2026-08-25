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
      .eq('id', importId);
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
