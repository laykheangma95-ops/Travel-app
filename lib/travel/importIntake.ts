// ─────────────────────────────────────────────────────────────────────────────
// The intake: a traveler pastes a link, and Domner writes down that it exists.
//
// WHAT PHASE 3 DOES, EXACTLY:
//   validate → normalize → classify → hash → look for something reusable →
//   record a job → hand back its id.
//
// WHAT IT DOES NOT DO, AND MUST NOT BE MADE TO LOOK LIKE IT DOES:
//   It does not fetch the link. It does not read the post. It does not know
//   what places are in it. A successful intake means "we have your link", and
//   the screen that reports it says exactly that — anything warmer would be the
//   product claiming an understanding it will not have until the connector
//   layer is built.
//
// WHY THE PLATFORM IS NEVER TAKEN FROM THE REQUEST:
//   It is derived here, from a hostname that has already passed validation. A
//   caller that could name its own platform could file a link as `tiktok` and
//   have a future connector reach for TikTok's API with a URL pointing
//   somewhere else entirely. The client sends a string; the server decides what
//   it is.
//
// WHY IT REUSES lib/travel rather than starting a features/ tree:
//   Classification (socialLink), hashing (urlHash), job rows (importJobs) and
//   the quota all already live here, and were built for exactly this. Rule 11.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { isUniqueViolation } from '@/lib/supabaseError';
import {
  assertWithinQuota,
  findReusableImport,
  type ImportPlatform,
  type ImportStatus,
} from './importJobs';
import { classifyLink } from './socialLink';
import { importKeyFor } from './urlHash';
import { parseSafeUrl, type UrlRejection } from './urlSafety';

/** Why an intake was refused, in terms a screen can turn into one sentence. */
export type IntakeRejection = UrlRejection | 'unavailable';

export interface IntakeAccepted {
  ok: true;
  importId: string;
  platform: ImportPlatform;
  status: ImportStatus;
  /** True when this link had already been imported and the result was replayed. */
  reused: boolean;
  /** True when an identical job was already open, so no second one was made. */
  alreadyQueued: boolean;
  normalizedUrl: string;
}

export interface IntakeRefused {
  ok: false;
  code: IntakeRejection;
}

export type IntakeResult = IntakeAccepted | IntakeRefused;

interface OpenImport {
  id: string;
  status: ImportStatus;
  platform: ImportPlatform;
}

/**
 * A job for this link that is already in flight for this traveler.
 *
 * Without this, a traveler who taps Import twice — or a client that retries —
 * gets two queued jobs for one link, and every connector then does the work
 * twice. The unique-index trick used for saved places is not available here
 * (a traveler may legitimately import the same link again next month, once the
 * first one has finished), so the idempotency window is "while a job is still
 * open".
 */
async function findOpenImport(
  supabase: SupabaseClient,
  userId: string,
  urlHash: string
): Promise<OpenImport | null> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .select('id,status,platform')
      .eq('user_id', userId)
      .eq('url_hash', urlHash)
      .in('status', ['queued', 'processing', 'needs_confirmation'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as OpenImport;
  } catch {
    return null;
  }
}

/**
 * Record an intake job, or replay one.
 *
 * Everything about it runs on the CALLER'S session client, so RLS decides what
 * can be read and written. That is also what makes the reuse lookup private:
 * `findReusableImport` filters on `user_id`, and the policy would refuse
 * another traveler's row even if it did not.
 *
 * ON CROSS-USER REUSE, deliberately not done:
 *   A viral link imported by a thousand travelers is extracted a thousand
 *   times, and that is the expensive case. Reusing somebody else's completed
 *   import would fix it — and would mean reading a row that belongs to them.
 *   Their import history is private: which links a person has pasted is a
 *   record of what they are planning and who they follow.
 *
 *   If it is ever worth doing, the thing to share is the DERIVED RESULT —
 *   candidates keyed by url_hash, in a table with no user column and no
 *   ownership — never another traveler's PlaceImport. Either way the caller
 *   gets a job row of their own; that is not the part worth economising on.
 */
export async function createImportFromUrl(
  supabase: SupabaseClient,
  userId: string,
  rawUrl: string
): Promise<IntakeResult> {
  // 1. Is this a URL we are willing to write down? Protocol, credentials,
  //    port, length, and every spelling of a private address.
  const verdict = parseSafeUrl(rawUrl);
  if (!verdict.ok) return { ok: false, code: verdict.code };

  const href = verdict.url.toString();

  // 2. What is it? Derived from the validated hostname, never from the caller.
  const classified = classifyLink(href);
  const platform: ImportPlatform = classified?.platform ?? 'web';

  // 3. A stable identity for the post, so the same link twice is the same key.
  //    normalizeForHash strips tracking parameters and nothing else — two
  //    genuinely different posts keep two different hashes.
  const key = importKeyFor(href);
  if (!key) {
    // parseSafeUrl already accepted it as a URL, so this is unreachable in
    // practice. Refused rather than stored keyless, because a row with no hash
    // can never be deduplicated or replayed.
    return { ok: false, code: 'malformed' };
  }

  // 4. Already in flight? Hand back the job they already have.
  const open = await findOpenImport(supabase, userId, key.urlHash);
  if (open) {
    return {
      ok: true,
      importId: open.id,
      platform: open.platform,
      status: open.status,
      reused: false,
      alreadyQueued: true,
      normalizedUrl: key.normalizedUrl,
    };
  }

  // 5. Already done? Replay it, and charge nothing for it.
  const reusable = await findReusableImport(supabase, userId, key.urlHash);
  if (reusable) {
    const { id: replayId } = await insertImport(supabase, {
      userId,
      originalUrl: rawUrl,
      key,
      platform,
      status: 'completed',
      reusedFromImportId: reusable.importId,
    });
    if (replayId) {
      log.info('import_intake.reused', { platform, importId: replayId });
      return {
        ok: true,
        importId: replayId,
        platform,
        status: 'completed',
        reused: true,
        alreadyQueued: false,
        normalizedUrl: key.normalizedUrl,
      };
    }
    // The replay row could not be written. Fall through and queue fresh work
    // rather than failing the traveler's request over bookkeeping.
  }

  // 6. New work, so it counts against the daily cap. Replays and re-submissions
  //    got here without passing this line, which is the point: a traveler is
  //    rationed on what costs something, not on how often they tap.
  await assertWithinQuota(supabase, userId);

  const inserted = await insertImport(supabase, {
    userId,
    originalUrl: rawUrl,
    key,
    platform,
    status: 'queued',
  });

  // Lost a race with a simultaneous submission of the same link — a double tap,
  // or a client retrying. The partial unique index refused the second row, and
  // the job the winner created is the right answer for both of them.
  if (inserted.conflict) {
    const open = await findOpenImport(supabase, userId, key.urlHash);
    if (open) {
      return {
        ok: true,
        importId: open.id,
        platform: open.platform,
        status: open.status,
        reused: false,
        alreadyQueued: true,
        normalizedUrl: key.normalizedUrl,
      };
    }
  }

  const importId = inserted.id;
  if (!importId) return { ok: false, code: 'unavailable' };

  log.info('import_intake.queued', { platform, importId });
  return {
    ok: true,
    importId,
    platform,
    status: 'queued',
    reused: false,
    alreadyQueued: false,
    normalizedUrl: key.normalizedUrl,
  };
}

interface InsertInput {
  userId: string;
  originalUrl: string;
  key: { urlHash: string; normalizedUrl: string };
  platform: ImportPlatform;
  status: ImportStatus;
  reusedFromImportId?: string;
}

/**
 * Write the row. Every column it sets is server-derived except `original_url`,
 * which is the traveler's own paste and is stored as given so a support
 * conversation can start from what they saw.
 */
async function insertImport(
  supabase: SupabaseClient,
  input: InsertInput
): Promise<{ id: string | null; conflict: boolean }> {
  try {
    const { data, error } = await supabase
      .from('place_imports')
      .insert({
        user_id: input.userId,
        original_url: input.originalUrl.slice(0, 2048),
        normalized_url: input.key.normalizedUrl.slice(0, 2048),
        url_hash: input.key.urlHash,
        platform: input.platform,
        status: input.status,
        ...(input.reusedFromImportId
          ? { reused_from_import_id: input.reusedFromImportId, completed_at: new Date().toISOString() }
          : {}),
      })
      .select('id')
      .single();

    if (error || !data) {
      // A unique violation here is the open-job index doing its job, not a
      // failure. Decided by SQLSTATE, never by the wording of a message.
      if (isUniqueViolation(error)) return { id: null, conflict: true };
      log.warn('import_intake.insert_failed', {
        reason: error?.message?.slice(0, 160) ?? 'no row',
      });
      return { id: null, conflict: false };
    }
    return { id: (data as { id: string }).id, conflict: false };
  } catch (error) {
    log.warn('import_intake.insert_threw', {
      reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown',
    });
    return { id: null, conflict: false };
  }
}
