// PATCH  /api/travel/trips/:id — edit a trip.
// DELETE /api/travel/trips/:id — delete a trip.
//
// Both go through the caller's session client, so `trips_all_own`
// (schema.sql:526) decides whether the row is theirs. Neither route compares
// user ids itself: an .eq('user_id', …) here would be a second, weaker copy of
// a rule the database already enforces, and the two could fall out of step.
//
// A row belonging to someone else is therefore not "forbidden" but simply not
// there — which is also the right answer to give, since confirming that a trip
// id exists would leak that somebody else has it.

import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { parseTripDraft, tripAfterWrite, tripById } from '@/lib/travel/tripWrites';
import { seedTripDays } from '@/lib/travel/tripSeed';
import { normalizeTripDraft } from '@/lib/travel/trips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/travel/trips/:id — one trip, shaped exactly like the ones in the list.
//
// The workspace, the edit screen and the memories screen each used to fetch the
// whole list and find their trip by id in the browser. That is correct but
// wasteful on a phone on hotel wifi: twenty trips' worth of JSON to render one.
//
// It goes through `tripById`, the same helper the create and edit routes use,
// so readiness here is derived by exactly the code that derives it everywhere
// else and the two can never disagree. Note that this trims the *response*, not
// the server's work — the shared context loader still runs its queries — so a
// trip that is not the caller's is simply not found.
export const GET = route(
  async (request, context) => {
    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');
    }
    const tripId = requireParam(context, 'tripId');
    await requireUser(request);
    return ok({ trip: await tripById(request, tripId) });
  },
  { rateLimit: 'session', name: 'travel.trips.one' }
);

export const PATCH = route(
  async (request, context) => {
    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');
    }

    const tripId = requireParam(context, 'tripId');
    await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');

    const draft = parseTripDraft(await readJson<unknown>(request));

    // A whole-object write, matching the form: the traveler edits every field on
    // one screen and saves once. `generated_itinerary` is untouched on purpose —
    // changing the dates must not silently discard a plan built against them.
    const { data, error } = await supabase
      .from('trip_plans')
      .update(normalizeTripDraft(draft))
      .eq('id', tripId)
      .select('id')
      .maybeSingle();

    if (error) throw new ApiError('INTERNAL', 'Could not save your changes. Please try again.');
    if (!data) throw new ApiError('NOT_FOUND', 'That trip could not be updated — it may have been deleted.');

    // Dates given to a trip that had none bring the day grid into being here,
    // and dates that moved re-stamp the days that already exist. Nothing is
    // deleted: a shortened trip keeps the days somebody has planned on.
    await seedTripDays(supabase, tripId, draft);

    // The update committed. A read-back that fails after that must not tell the
    // traveler their save was lost — see tripAfterWrite.
    return ok({ trip: await tripAfterWrite(request, tripId, draft) });
  },
  { rateLimit: 'tripWrite', name: 'travel.trips.update' }
);

export const DELETE = route(
  async (request, context) => {
    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');
    }

    const tripId = requireParam(context, 'tripId');
    await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');

    // The checklist items and memories hanging off this trip go with it —
    // ON DELETE CASCADE (schema.sql:202, 214). That is the intended behaviour,
    // and it is why the UI confirms before calling this.
    const { data, error } = await supabase
      .from('trip_plans')
      .delete()
      .eq('id', tripId)
      .select('id')
      .maybeSingle();

    if (error) throw new ApiError('INTERNAL', 'Could not delete that trip. Please try again.');
    if (!data) throw new ApiError('NOT_FOUND', 'That trip has already been deleted.');

    return ok({ deleted: tripId });
  },
  { rateLimit: 'tripWrite', name: 'travel.trips.delete' }
);
