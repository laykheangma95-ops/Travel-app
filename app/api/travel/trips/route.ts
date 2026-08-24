// GET /api/travel/trips — the caller's trips, with readiness already derived.
// POST /api/travel/trips — create one.
//
// Separate from /api/travel/state on purpose: that endpoint answers "what moment
// is it?" and returns one active trip, whereas the Trips workspace needs the
// whole list. Both read the same context loader, so readiness is computed once,
// in one place, and the two screens can never disagree about whether the eSIM is
// sorted.
//
// Both verbs write and read through the CALLER'S session client, never the
// service role: RLS (`trips_all_own`, schema.sql:526) is what actually confines
// a traveler to their own rows. The route validates shape; the database
// enforces ownership.

import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { FULL_TRIP_LIMIT, loadTravelerContext } from '@/lib/travel/context';
import { deriveTravelState } from '@/lib/travel/state';
import { parseTripDraft, tripAfterWrite } from '@/lib/travel/tripWrites';
import { adoptWishlistTrip, adoptableWishlistTrip, seedTripDays } from '@/lib/travel/tripSeed';
import { normalizeTripDraft } from '@/lib/travel/trips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    if (!getSupabase()) return ok({ trips: [], activeTripId: null, unconfigured: true });

    // Trips are personal, so this one does require an account — unlike the state
    // endpoint, there is no meaningful guest answer to "show me my trips".
    await requireUser(request);

    // The traveler's own list, so it loads their whole history rather than
    // Home's window. Truncating someone's trips page reads as data loss.
    const context = await loadTravelerContext(request, { tripLimit: FULL_TRIP_LIMIT });
    if (!context.signedIn) throw new ApiError('UNAUTHORIZED', 'Sign in to see your trips.');

    const snapshot = deriveTravelState(context);

    return ok({
      trips: context.trips,
      activeTripId: snapshot.activeTrip?.id ?? null,
      state: snapshot.state,
    });
  },
  { rateLimit: 'session', name: 'travel.trips' }
);

export const POST = route(
  async (request) => {
    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');
    }

    const user = await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Trips are unavailable right now.');

    const draft = parseTripDraft(await readJson<unknown>(request));

    // A trip auto-created by saving a place becomes THIS trip rather than a
    // second row beside it, so the places already gathered for this destination
    // are on the trip from the first second. See lib/travel/tripSeed.ts for the
    // four conditions that have to hold before a row is adopted.
    const candidate = await adoptableWishlistTrip(supabase, user.id, draft.destination);
    let tripId: string | null = null;
    if (candidate && (await adoptWishlistTrip(supabase, candidate, draft))) tripId = candidate;

    if (!tripId) {
      // user_id is taken from the verified JWT, never from the body. RLS would
      // reject a forged one anyway — this just means the request never gets that
      // far, and a traveler cannot file a trip under someone else's account.
      const { data, error } = await supabase
        .from('trip_plans')
        .insert({ user_id: user.id, ...normalizeTripDraft(draft) })
        .select('id')
        .single();

      if (error || !data) {
        throw new ApiError('INTERNAL', 'Could not save that trip. Please try again.');
      }
      tripId = data.id as string;
    }

    // The day grid, from the dates the traveler just gave. Best-effort: the
    // trip exists either way, and the itinerary screen can still add days.
    await seedTripDays(supabase, tripId, draft);

    // Re-read through the same loader the list uses, so the card the traveler
    // lands on is derived identically to every other card — including readiness
    // against any flight or eSIM they already have for that destination. If
    // that read fails, the insert above still happened: `tripAfterWrite` hands
    // back the trip as written rather than reporting a failure that would
    // invite the traveler to create a duplicate.
    const trip = await tripAfterWrite(request, tripId, draft);

    return ok({ trip }, { status: 201 });
  },
  { rateLimit: 'tripWrite', name: 'travel.trips.create' }
);
