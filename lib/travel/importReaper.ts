// ─────────────────────────────────────────────────────────────────────────────
// The stuck-job reaper.
//
// WHAT IT IS FOR:
//   docs/PLACE-IMPORT.md has said since Phase 3: "a job stuck in `processing`
//   keeps that link un-importable for that traveler until it reaches a
//   terminal status. The connector phase needs a reaper that fails jobs which
//   have been open too long." A job can get stuck for the ordinary reasons any
//   background work can — a function killed mid-flight, a connector that hangs
//   past its own timeout, a deploy that interrupted a request — and Phase 3's
//   own partial unique index (place_imports_open_idx) means a stuck job is not
//   just untidy: it BLOCKS that exact link for that traveler until it reaches
//   a terminal status, because `processing` is one of the open states the
//   index covers.
//
// WHY THIS RUNS ON THE SERVICE-ROLE CLIENT:
//   A reaper has to see every traveler's stuck jobs, not just one — RLS's
//   own-row policies on place_imports (migration 012) are exactly what a
//   single-user session client cannot get past, by design. CLAUDE.md rule 3
//   allows the service key here because this is server-side, system-triggered
//   maintenance, not a request acting on a traveler's behalf; it is reached
//   only through requireAdminOrService() (app/api/imports/reap/route.ts), the
//   same gate app/api/notifications/dispatch/route.ts already uses for
//   scheduled jobs — see docs/SOCIAL-SAVE.md §1.14: there is no worker to run
//   a job on, only an authenticated endpoint an external scheduler calls.
//
// WHY ONE UPDATE STATEMENT IS THE WHOLE SAFETY ARGUMENT:
//   `UPDATE ... WHERE status = 'processing' AND started_at < cutoff` is
//   idempotent (running it twice only ever touches rows still `processing`
//   after the first run — a row this reaper already failed is not
//   `processing` any more, so a second sweep leaves it alone) and safe under
//   concurrency (two sweeps racing on the same row serialize at the database;
//   the loser's WHERE clause matches nothing once the winner's UPDATE has
//   committed, exactly the pattern importOrchestrator.ts's claim uses for the
//   opposite transition). Nothing here needs an advisory lock or a job queue
//   of its own.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

/**
 * How long a job may sit in `processing` before it is presumed dead.
 *
 * Deliberately generous relative to the actual work: the connector layer's own
 * fetches are bounded in seconds (linkPreview's TOTAL_TIMEOUT_MS, mapsResolve's
 * TOTAL_TIMEOUT_MS, placeAgent's 20s model timeout), so a genuine run finishes
 * in well under a minute. Ten minutes is not a performance budget, it is "this
 * could not possibly still be legitimately running" — the same reasoning
 * app/api/travel/extract's `maxDuration = 60` uses for its own hard ceiling,
 * with a wide margin so the reaper never races a request that is merely slow.
 */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function reapTimeoutMs(): number {
  const raw = Number(process.env.PLACE_IMPORT_REAP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TIMEOUT_MS;
}

export interface ReapResult {
  /** How many jobs were flipped from `processing` to `failed` this sweep. */
  failed: number;
  /** Their ids, capped, for the log line — never for a response body. */
  sampleIds: string[];
}

/**
 * Fail every job that has been `processing` longer than the timeout.
 *
 * `COALESCE(started_at, created_at)` matters: `started_at` was added by
 * migration 015 for the queue, but app/api/travel/extract's synchronous
 * pipeline (migration 012) writes `status = 'processing'` too, via
 * `startImport`, and has never set `started_at`. A row from that older path
 * that got stuck — a serverless function killed mid-request, past its own
 * `maxDuration` — would otherwise be invisible to this reaper forever.
 *
 * `client` is expected to be the service-role client (getSupabaseAdmin()),
 * never a caller's session client — see the file header.
 */
export async function reapStuckImports(client: SupabaseClient, timeoutMs = reapTimeoutMs()): Promise<ReapResult> {
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();

  try {
    // One UPDATE, one WHERE clause, sent as one PostgREST request — the whole
    // atomicity argument in the file header depends on this being a single
    // statement rather than a read followed by a write.
    const { data, error } = await client
      .from('place_imports')
      .update({
        status: 'failed',
        error_code: 'stuck_timeout',
        error_message: 'This import took too long and was cancelled. Paste the link again to retry.',
        completed_at: new Date().toISOString(),
      })
      .eq('status', 'processing')
      .or(`started_at.lt.${cutoff},and(started_at.is.null,created_at.lt.${cutoff})`)
      .select('id');

    if (error) {
      log.warn('import_reaper.update_failed', { reason: error.message.slice(0, 160) });
      return { failed: 0, sampleIds: [] };
    }

    const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length > 0) {
      log.warn('import_reaper.reaped', { count: ids.length, sample: ids.slice(0, 5) });
    }
    return { failed: ids.length, sampleIds: ids.slice(0, 20) };
  } catch (error) {
    log.warn('import_reaper.threw', {
      reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown',
    });
    return { failed: 0, sampleIds: [] };
  }
}
