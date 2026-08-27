// POST /api/travel/destination-places/:id/resolution — confirm, reject or
// correct a canonical-resolution proposal for one of the traveler's own
// saved places (Phase 13).
//
// NOT /api/travel/places/:id — that route's `:id` is a `places.id`, the
// CANONICAL registry row. This one's `:id` is a `destination_places.id`, the
// traveler's OWN copy. Reusing the other route's path would make one
// `:id` segment mean two different tables depending on the verb, which is
// exactly the kind of ambiguity a forged-id attack looks for.
//
// THE BODY IS DELIBERATELY MINIMAL: `{ decision, correctedPlaceId? }`. No
// userId, no confidence, no resolverVersion, no decidedAt, no proposedPlaceId
// — every one of those is re-derived server-side
// (lib/places/resolutionFeedback.ts) rather than trusted from the client. A
// client that could set its own confidence could manufacture a confirmation
// for a proposal that was never actually offered.
//
// OWNERSHIP AND VISIBILITY ARE RE-CHECKED, NEVER ASSUMED FROM THE URL:
// applyResolutionFeedback re-derives the proposal from the traveler's OWN
// destination_places row (RLS + an explicit created_by check), and
// migration 017's RPC re-checks both that ownership and the visibility of
// whatever place id it is about to attach — under the caller's own session
// client, never a service_role.
//
// TRAVELER CONFIRMATION NEVER PROMOTES verification_status. This route
// cannot reach `provider_verified` or `domner_public` by any value of its
// body — that ceiling is migration 013's RLS and trigger, unmodified by
// Phase 13, and nothing here tries to write around it.

import { z } from 'zod';
import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { applyResolutionFeedback } from '@/lib/places/resolutionFeedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

const resolutionRequest = z
  .object({
    decision: z.enum(['confirmed', 'rejected', 'corrected']),
    correctedPlaceId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => value.decision !== 'corrected' || Boolean(value.correctedPlaceId), {
    message: 'A correction must name the place it corrects to.',
    path: ['correctedPlaceId'],
  });

export const POST = route(
  async (request, context) => {
    // requireUser FIRST — a signed-out caller gets 401, not the 503 an
    // unconfigured backend would otherwise produce, same reasoning as every
    // other place route.
    const user = await requireUser(request);

    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Confirming that place is unavailable right now.');
    }
    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Confirming that place is unavailable right now.');
    }

    const rawId = requireParam(context, 'id');
    const parsedId = idSchema.safeParse(rawId);
    // A malformed id is refused the same way an invisible or foreign one is:
    // NOT_FOUND, not BAD_REQUEST — see GET /api/travel/places/:id for why the
    // two paths are collapsed into one response shape. Never an existence
    // oracle for a destination_places id that belongs to someone else.
    if (!parsedId.success) {
      throw new ApiError('NOT_FOUND', 'We could not find that place.');
    }

    const parsedBody = resolutionRequest.safeParse(await readJson<unknown>(request));
    if (!parsedBody.success) {
      throw new ApiError('BAD_REQUEST', 'That request could not be understood.');
    }

    const result = await applyResolutionFeedback(supabase, user.id, {
      destinationPlaceId: parsedId.data,
      decision: parsedBody.data.decision,
      correctedPlaceId: parsedBody.data.correctedPlaceId ?? null,
    });

    switch (result.outcome) {
      case 'applied':
        return ok({ outcome: 'applied' as const, canonicalPlaceId: result.canonicalPlaceId });
      case 'not-found':
        throw new ApiError('NOT_FOUND', 'We could not find that place.');
      case 'no-proposal':
        // Not the traveler's fault, and not really an error: the question
        // they were shown no longer applies (the registry moved on). 200 with
        // a plain outcome, same reasoning as POST /api/travel/places/:id/add-to-trip's
        // needsChoice — a normal branch, not a crash.
        return ok({ outcome: 'no-proposal' as const, canonicalPlaceId: null });
      case 'invalid-correction':
        throw new ApiError('BAD_REQUEST', 'That is not one of the places offered.');
      case 'failed':
      default:
        throw new ApiError('INTERNAL', 'That decision could not be saved.');
    }
  },
  { rateLimit: 'tripWrite', name: 'travel.destinationPlaces.resolution' }
);
