// GET /api/travel/trips — the caller's trips, with readiness already derived.
//
// Separate from /api/travel/state on purpose: that endpoint answers "what moment
// is it?" and returns one active trip, whereas the Trips workspace needs the
// whole list. Both read the same context loader, so readiness is computed once,
// in one place, and the two screens can never disagree about whether the eSIM is
// sorted.

import { ApiError, ok, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { loadTravelerContext } from '@/lib/travel/context';
import { deriveTravelState } from '@/lib/travel/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    if (!getSupabase()) return ok({ trips: [], activeTripId: null, unconfigured: true });

    // Trips are personal, so this one does require an account — unlike the state
    // endpoint, there is no meaningful guest answer to "show me my trips".
    await requireUser(request);

    const context = await loadTravelerContext(request);
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
