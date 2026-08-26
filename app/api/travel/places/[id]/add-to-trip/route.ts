// POST /api/travel/places/:id/add-to-trip — put a canonical place onto a trip.
//
// A DEDICATED ROUTE, not an extension of POST /api/travel/places/save. That
// endpoint's `.strict()` schema is keyed on a guide's `contentSlug` on purpose
// (SOCIAL-SAVE.md Part 10 draws this line deliberately: a guide save and a
// library save are different things reached from different places). This
// route names a canonical `places.id` instead — in the URL, never the body —
// and hands off to lib/places/addToTrip.ts, where the decision lives (rule 9).
//
// THE ID IN THE URL IS NEVER TRUSTED AS PROOF OF ANYTHING, same as
// GET /api/travel/places/:id. `addPlaceToTrip` re-derives visibility from RLS
// on every call via `getPlaceById` on the caller's own session client — a
// place that exists but is not this traveler's to see behaves exactly like a
// place that does not exist, before any trip write is even considered.
//
// The request body accepts only `tripId`, optional. No userId, no
// created_by, no ownership or verification field of any kind — the
// authenticated traveler is derived from the session, never from the body.

import { z } from 'zod';
import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { addPlaceToTrip } from '@/lib/places/addToTrip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

const addToTripRequest = z
  .object({
    tripId: z.string().uuid().optional(),
  })
  .strict();

export const POST = route(
  async (request, context) => {
    // requireUser FIRST — a signed-out caller gets 401, not the 503 an
    // unconfigured backend would otherwise produce, same reasoning as every
    // other place route.
    const user = await requireUser(request);

    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Adding places to a trip is unavailable right now.');
    }
    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Adding places to a trip is unavailable right now.');
    }

    const rawId = requireParam(context, 'id');
    const parsedId = idSchema.safeParse(rawId);
    // A malformed id is refused the same way an invisible one is: NOT_FOUND,
    // not BAD_REQUEST — see GET /api/travel/places/:id for why the two paths
    // are collapsed into one response shape.
    if (!parsedId.success) {
      throw new ApiError('NOT_FOUND', 'We could not find that place.');
    }

    const parsedBody = addToTripRequest.safeParse(await readJson<unknown>(request));
    if (!parsedBody.success) {
      throw new ApiError('BAD_REQUEST', 'That request could not be understood.');
    }

    const result = await addPlaceToTrip(supabase, user.id, parsedId.data, parsedBody.data.tripId);

    // Both outcomes are 200, matching POST /api/travel/places/save: `needsChoice`
    // is a normal branch, not a failure, and giving it an error status would make
    // every client's `if (!response.ok) throw` treat it as a crash.
    return ok(result);
  },
  { rateLimit: 'tripWrite', name: 'travel.places.addToTrip' }
);
