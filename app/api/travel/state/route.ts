// GET /api/travel/state — the caller's travel moment.
//
// Home asks this once and renders for the answer (see lib/travel/state.ts). A
// signed-out visitor gets a well-formed "new_user" snapshot rather than a 401,
// because guests browse Domner freely and the homepage must not depend on
// authentication to render.

import { getSupabase } from '@/lib/supabase';
import { ok, route } from '@/lib/http';
import { loadTravelerContext } from '@/lib/travel/context';
import { deriveTravelState } from '@/lib/travel/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    // With no Supabase configured there is nothing to personalise against. The
    // homepage still renders its discovery experience.
    if (!getSupabase()) {
      return ok({ signedIn: false, snapshot: null, unconfigured: true });
    }

    const context = await loadTravelerContext(request);
    if (!context.signedIn) {
      return ok({ signedIn: false, snapshot: null });
    }

    return ok({
      signedIn: true,
      displayName: context.displayName,
      snapshot: deriveTravelState(context),
    });
  },
  { rateLimit: 'session', name: 'travel.state' }
);
