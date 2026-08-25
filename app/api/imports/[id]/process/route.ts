// ─────────────────────────────────────────────────────────────────────────────
// POST /api/imports/:id/process — "read the link I already told you about".
//
// The Phase 4 half of the intake. POST /api/imports (Phase 3) only records
// that a link exists; this is what actually asks a connector to read it. Split
// into two requests, deliberately, matching the split that already exists
// between /api/imports (record) and /api/travel/extract (read): recording a
// link must never fetch anything on its own — see lib/travel/importIntake.ts.
//
// OWNERSHIP: requireUser() plus supabaseFromRequest() means every read and
// write here runs on the caller's own session client, so RLS confines this to
// jobs the caller owns — a forged id belonging to another traveler resolves to
// NOT_FOUND, never to reading their job. See lib/travel/importOrchestrator.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, ok, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { processImport } from '@/lib/travel/importOrchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A connector call plus the caption pipeline; same budget as /api/travel/extract. */
export const maxDuration = 60;

export const POST = route(
  async (request, context) => {
    const user = await requireUser(request);
    const importId = requireParam(context, 'id');

    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Imports are unavailable right now.');
    }

    const result = await processImport(supabase, user.id, importId);

    if (result.outcome === 'not-found') {
      throw new ApiError('NOT_FOUND', 'We could not find that import.');
    }

    return ok({
      status: result.status,
      outcome: result.importOutcome,
      candidateCount: result.candidateCount,
      stillProcessing: result.outcome === 'already-processing',
    });
  },
  { rateLimit: 'tripWrite', name: 'travel.imports.process' }
);
