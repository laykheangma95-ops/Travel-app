// ─────────────────────────────────────────────────────────────────────────────
// GET /api/imports/:id — "how is my import doing, and what did it find?"
//
// The read side of the queued-job pipeline. POST /api/imports (Phase 3)
// records a link; POST /api/imports/:id/process (Phase 4) claims and runs it;
// this is what a client polls to find out when it is done, and to fetch the
// candidates once it is — the piece Phase 4 explicitly built the state machine
// for but left unread (see docs/PLACE-IMPORT.md, "What Phase 4 deliberately
// did not do").
//
// OWNERSHIP: requireUser() plus supabaseFromRequest() means this runs on the
// caller's own session client, so RLS confines it to jobs the caller owns —
// a forged id belonging to another traveler, or one that does not exist,
// resolves to NOT_FOUND. See lib/travel/importJobs.ts's loadImportForReview().
//
// READ ONLY. This never writes place_imports.status — the only writers stay
// claimQueuedImport, completeImportIfProcessing and failImportWithReason
// (lib/travel/importOrchestrator.ts, lib/travel/importJobs.ts), guarded by
// migration 016's terminal-status trigger. Adding a second writer here was
// never the point of this route.
//
// errorCode, not errorMessage: a failed job's error_code is validated against
// a closed vocabulary before it ever leaves loadImportForReview(), so it is
// safe to return to whoever owns the row. error_message is free text a
// server-side caller wrote, and not every writer treats it as
// traveler-facing — see lib/travel/importJobs.ts's ImportJobSnapshot comment.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, ok, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { loadImportForReview } from '@/lib/travel/importJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request, context) => {
    const user = await requireUser(request);
    const importId = requireParam(context, 'id');

    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Imports are unavailable right now.');
    }

    const snapshot = await loadImportForReview(supabase, user.id, importId);
    if (!snapshot) {
      throw new ApiError('NOT_FOUND', 'We could not find that import.');
    }

    return ok({
      status: snapshot.status,
      outcome: snapshot.outcome,
      candidateCount: snapshot.candidates.length,
      candidates: snapshot.candidates,
      preview: snapshot.preview,
      usedModel: snapshot.usedModel,
      // errorCode only, never errorMessage: errorCode is validated against a
      // closed vocabulary (lib/travel/importJobs.ts's isImportErrorCode), so
      // it is safe to hand to any caller who owns the row. errorMessage is
      // not — for `connector_error`, failImportWithReason() can be called
      // with a plain caught Error's raw `.message` (importOrchestrator.ts),
      // which was never written with a traveler as its audience. It stays
      // available on the snapshot for a future internal/staff surface, but
      // this traveler-facing route does not forward it.
      errorCode: snapshot.errorCode,
    });
  },
  // A poll loop is many small reads in a short window — the 'session' tier
  // (60/min) other read-only travel GETs already use (travel.trips,
  // travel.itinerary.read), not 'tripWrite', which the process route uses for
  // its one write per job.
  { rateLimit: 'session', name: 'travel.imports.read' }
);
