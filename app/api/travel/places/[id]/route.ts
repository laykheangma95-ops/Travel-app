// GET /api/travel/places/:id — one canonical place, for the place-detail page.
//
// Read-only, and the read that matters here is not "does this row exist" but
// "does this row exist FOR THIS CALLER" — those are two different questions,
// and this route only ever answers the second one. `getPlaceById` runs on the
// caller's own session client (never the service role), so
// `places_read_public_or_own` (migration 013) is what decides whether the row
// comes back at all. A place that exists but is somebody else's unverified
// guess and a place that does not exist produce the exact same response here,
// on purpose — see app/api/travel/places/saved/route.ts, which settled this
// same question first: distinguishing them would turn a 404 into an oracle for
// enumerating other travelers' private places.
//
// THE ID IN THE URL IS NEVER TRUSTED AS PROOF OF ANYTHING. It might be a real
// `places.id`, a guess, or a value copied from a `destination_places.canonical_place_id`
// that a traveler could in principle have pointed at any existing place via a
// direct PostgREST call (the FK only proves the id exists, not that the writer
// was allowed to look at it). None of that matters here: this route re-derives
// visibility from RLS on every request, from scratch, regardless of how the id
// arrived.
//
// Deliberately thin, like every other travel route: it validates the wire
// shape and hands off to lib/places/repository.ts and lib/places/saved.ts,
// where the decisions live (rule 9).

import { z } from 'zod';
import { ApiError, ok, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { getPlaceById } from '@/lib/places/repository';
import { getSaveCounts, isPlaceSaved } from '@/lib/places/saved';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

export const GET = route(
  async (request, context) => {
    // requireUser FIRST, same reasoning as every other place route: a
    // signed-out caller gets 401, not the 503 an unconfigured backend would
    // otherwise produce — the two mean different things to a client deciding
    // whether to offer a sign-in link. Phase 8 is authenticated-only by
    // decision (no anonymous place pages yet), so there is no signed-out path
    // to design here at all.
    const user = await requireUser(request);

    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Places are unavailable right now.');
    }
    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Places are unavailable right now.');
    }

    const rawId = requireParam(context, 'id');
    const parsed = idSchema.safeParse(rawId);
    // A malformed id is refused the same way an invisible one is: NOT_FOUND,
    // not BAD_REQUEST. A request shape can leak information too — "that is not
    // even a UUID" is not a fact worth handing back for free — and the two
    // paths are already the same status by the time getPlaceById runs, so
    // failing the same way one line earlier costs nothing and keeps the rule
    // simple to state: this route only ever says "found" or "not found".
    if (!parsed.success) {
      throw new ApiError('NOT_FOUND', 'We could not find that place.');
    }
    const placeId = parsed.data;

    const place = await getPlaceById(supabase, placeId);
    if (!place) {
      throw new ApiError('NOT_FOUND', 'We could not find that place.');
    }

    const [saved, saveCounts] = await Promise.all([
      isPlaceSaved(supabase, user.id, placeId),
      getSaveCounts(supabase, [placeId]),
    ]);

    // `RegistryPlace.createdBy` is the submitter's user id. It is fine inside
    // the server (promotePlace's audit trail wants it) and it is never fine on
    // the wire: for a domner_public place that started as somebody's import,
    // handing that id to every other signed-in traveler who opens the page
    // would link "this place" to "this other person's account" for no reason
    // the page needs. lib/places/saved.ts's own client-facing SavedPlace type
    // already omits it for exactly this reason — this mirrors that shape
    // rather than inventing a second rule.
    const { createdBy: _createdBy, ...publicPlace } = place;

    return ok({
      place: publicPlace,
      saved,
      // Absent from the map (rather than zero) only when place_stats has no
      // row for this id at all, which the migration 014 backfill rules out for
      // every existing place — kept as a fallback rather than assumed.
      saveCount: saveCounts.get(placeId) ?? 0,
    });
  },
  { rateLimit: 'catalog', name: 'travel.places.detail' }
);
