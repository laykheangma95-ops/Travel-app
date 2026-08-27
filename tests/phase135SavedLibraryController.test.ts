// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 MEDIUM-2 remediation — the extracted Saved-tab lifecycle and
// Saved→day decision logic, tested as the exact functions
// components/travel/ItineraryEditor.tsx calls (lib/travel/
// savedLibraryController.ts), not a hand-recreated simulator of them.
//
// Split from the route-level test (tests/phase135SavedToSelectedDayRoute.
// test.ts, removed by this remediation) because that file only proved the
// BACKEND sequence works when issued by hand — it could not fail if the
// CLIENT stopped calling it. This file drives `addSavedPlaceToTrip` itself
// through real, route-backed ports, so a regression in the actual decision
// (move onto the selected day only on a fresh add) fails here.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestGeneration } from '@/lib/travel/requestGeneration';
import {
  addSavedPlaceToTrip,
  runSavedLibraryLoad,
  shouldStartLibraryLoad,
  type LibraryLoadPorts,
  type LibraryPlace,
} from '@/lib/travel/savedLibraryController';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

// ── Lifecycle (HIGH-2) — pure predicate, no I/O ─────────────────────────────

describe('shouldStartLibraryLoad — the entire self-invalidation fix, as a pure decision', () => {
  it('starts when the picker is open, a destination is known, and nothing has started yet', () => {
    expect(shouldStartLibraryLoad({ picker: true, destination: 'Vietnam', alreadyStarted: false })).toBe(true);
  });

  it('never starts while the picker is closed', () => {
    expect(shouldStartLibraryLoad({ picker: false, destination: 'Vietnam', alreadyStarted: false })).toBe(false);
  });

  it('never starts before the destination is known', () => {
    expect(shouldStartLibraryLoad({ picker: true, destination: null, alreadyStarted: false })).toBe(false);
  });

  it('never starts a second time once already started — this is the whole guard the old code got wrong by reading state instead of a ref', () => {
    expect(shouldStartLibraryLoad({ picker: true, destination: 'Vietnam', alreadyStarted: true })).toBe(false);
  });
});

describe('runSavedLibraryLoad — the exact state machine ItineraryEditor.tsx calls', () => {
  function ports(overrides: Partial<LibraryLoadPorts> = {}): LibraryLoadPorts & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      fetchImpl: async () => {
        calls.push('fetch');
        return [];
      },
      setLoading: () => calls.push('loading'),
      setLoaded: () => calls.push('loaded'),
      setError: () => calls.push('error'),
      ...overrides,
    };
  }

  it('success: loading, then loaded — never touches its own generation', async () => {
    const generation = new RequestGeneration();
    const p = ports();
    await runSavedLibraryLoad('Vietnam', generation, p);
    expect(p.calls).toEqual(['loading', 'fetch', 'loaded']);
  });

  it('error: loading, then error — never stuck', async () => {
    const generation = new RequestGeneration();
    const p = ports({
      fetchImpl: async () => {
        throw new Error('library unavailable');
      },
    });
    await runSavedLibraryLoad('Vietnam', generation, p);
    expect(p.calls).toEqual(['loading', 'error']); // fetchImpl threw before pushing 'fetch'; setError still runs
  });

  it('error genuinely reaches setError', async () => {
    const generation = new RequestGeneration();
    const states: string[] = [];
    await runSavedLibraryLoad('Vietnam', generation, {
      fetchImpl: async () => {
        throw new Error('boom');
      },
      setLoading: () => states.push('loading'),
      setLoaded: () => states.push('loaded'),
      setError: () => states.push('error'),
    });
    expect(states).toEqual(['loading', 'error']);
  });

  it('a stale first attempt cannot overwrite a genuinely newer one (manual retry)', async () => {
    const generation = new RequestGeneration();
    const applied: string[] = [];
    let releaseFirst: (places: LibraryPlace[]) => void = () => {};
    const firstPending = new Promise<LibraryPlace[]>((resolve) => {
      releaseFirst = resolve;
    });

    // Attempt 1 starts and hangs.
    const first = runSavedLibraryLoad('Vietnam', generation, {
      fetchImpl: async () => firstPending,
      setLoading: () => {},
      setLoaded: () => applied.push('first'),
      setError: () => {},
    });

    // A retry (attempt 2) supersedes it before attempt 1 resolves.
    const second = runSavedLibraryLoad('Vietnam', generation, {
      fetchImpl: async () => [{ savedId: 'b' } as LibraryPlace],
      setLoading: () => {},
      setLoaded: () => applied.push('second'),
      setError: () => {},
    });
    await second;

    // Attempt 1's late answer arrives. It must never apply.
    releaseFirst([{ savedId: 'stale' } as LibraryPlace]);
    await first;

    expect(applied).toEqual(['second']);
  });

  it('reopening after a successful load is not this function\'s concern — shouldStartLibraryLoad already blocked it, so an empty library still resolves to loaded([])', async () => {
    const generation = new RequestGeneration();
    let loadedWith: LibraryPlace[] | null = null;
    await runSavedLibraryLoad('Thailand', generation, {
      fetchImpl: async () => [],
      setLoading: () => {},
      setLoaded: (places) => {
        loadedWith = places;
      },
      setError: () => {},
    });
    expect(loadedWith).toEqual([]);
  });
});

// ── Saved → selected day (MEDIUM-4), against real routes ───────────────────

const session = vi.hoisted(() => ({ client: null as unknown, userId: '' }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: session.userId }),
  supabaseFromRequest: () => session.client,
}));
const { GET: getItinerary, PATCH } = await import('@/app/api/travel/itinerary/[tripId]/route');
const { POST: addToTripRoute } = await import('@/app/api/travel/places/[id]/add-to-trip/route');

let harness: Harness;

function signIn(userId: string) {
  session.userId = userId;
  session.client = harness.clientFor(userId);
}

/** Real, route-backed ports — the same shape ItineraryEditor.tsx's
 *  addFromLibrary builds, minus the browser `fetch` wrapper. */
function realPorts(tripId: string) {
  return {
    addToTrip: async (placeId: string, forTripId: string) => {
      const request = new Request(`https://domner.test/api/travel/places/${placeId}/add-to-trip`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ tripId: forTripId }),
      });
      const response = await addToTripRoute(request, { params: { id: placeId } });
      return response.json();
    },
    findFiledIdeaId: async (canonicalPlaceId: string) => {
      const request = new Request(`https://domner.test/api/travel/itinerary/${tripId}`, {
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      const response = await getItinerary(request, { params: { tripId } });
      const body = await response.json();
      const filed = body.ideas.find((item: { place: { canonical_place_id: string | null } }) => item.place.canonical_place_id === canonicalPlaceId);
      return filed?.id ?? null;
    },
    moveToDay: async (dayId: string, itineraryPlaceId: string) => {
      const request = new Request(`https://domner.test/api/travel/itinerary/${tripId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ action: 'move', dayId, placeId: itineraryPlaceId }),
      });
      const response = await PATCH(request, { params: { tripId } });
      if (response.status !== 200) throw new Error('move failed');
    },
  };
}

async function seedCanonicalPlace(name = 'Wat Pho') {
  const service = harness.serviceClient();
  const { data } = await service
    .from('places')
    .insert({
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      country_name: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'domner_public',
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

async function seedTripWithTwoDays() {
  const [tripRow] = await harness.asAdmin(
    `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Thailand trip','Thailand') RETURNING id`,
    [ALICE]
  );
  const tripId = tripRow.id as string;
  const [thuRow] = await harness.asAdmin(
    `INSERT INTO itinerary_days (trip_id, day_index, date) VALUES ($1, 1, '2026-08-27') RETURNING id`,
    [tripId]
  );
  const [friRow] = await harness.asAdmin(
    `INSERT INTO itinerary_days (trip_id, day_index, date) VALUES ($1, 2, '2026-08-28') RETURNING id`,
    [tripId]
  );
  return { tripId, thuId: thuRow.id as string, friId: friRow.id as string };
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  signIn(ALICE);
});

afterAll(async () => {
  await harness.close();
});

describe('addSavedPlaceToTrip — the exact function addFromLibrary calls', () => {
  it('a day is selected: the production function calls addToTrip, then moveToDay onto THAT day', async () => {
    const { tripId, thuId, friId } = await seedTripWithTwoDays();
    const placeId = await seedCanonicalPlace('Wat Pho');

    const result = await addSavedPlaceToTrip(placeId, tripId, { dayId: thuId }, realPorts(tripId));
    expect(result.ok).toBe(true);

    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(1);
    expect(rows[0].itinerary_day_id).toBe(thuId);
    expect(rows.filter((r) => r.itinerary_day_id === friId)).toHaveLength(0);
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('Ideas context (dayId: null): stays in Ideas, moveToDay is never invoked', async () => {
    const { tripId } = await seedTripWithTwoDays();
    const placeId = await seedCanonicalPlace('Wat Pho');

    const ports = realPorts(tripId);
    let moveCalled = false;
    const wrappedMove = async (...args: Parameters<typeof ports.moveToDay>) => {
      moveCalled = true;
      return ports.moveToDay(...args);
    };

    const result = await addSavedPlaceToTrip(placeId, tripId, { dayId: null }, { ...ports, moveToDay: wrappedMove });
    expect(result.ok).toBe(true);
    expect(moveCalled).toBe(false);

    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(1);
    const day = await harness.asAdmin(`SELECT day_index FROM itinerary_days WHERE id = $1`, [rows[0].itinerary_day_id]);
    expect(day[0].day_index).toBe(0);
  });

  it('idempotent: a duplicate add (alreadyAdded) never calls moveToDay, and never relocates the existing item', async () => {
    const { tripId, thuId } = await seedTripWithTwoDays();
    const placeId = await seedCanonicalPlace('Wat Pho');

    await addSavedPlaceToTrip(placeId, tripId, { dayId: thuId }, realPorts(tripId));

    const ports = realPorts(tripId);
    let moveCalled = false;
    const wrappedMove = async (...args: Parameters<typeof ports.moveToDay>) => {
      moveCalled = true;
      return ports.moveToDay(...args);
    };

    const second = await addSavedPlaceToTrip(placeId, tripId, { dayId: thuId }, { ...ports, moveToDay: wrappedMove });
    expect(second.ok).toBe(true);
    expect(moveCalled).toBe(false);

    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(1);
    expect(rows[0].itinerary_day_id).toBe(thuId);
  });

  it('an add-to-trip failure never calls moveToDay and reports the failure', async () => {
    let moveCalled = false;
    const result = await addSavedPlaceToTrip(
      '00000000-0000-4000-8000-000000000000', // no such place
      'irrelevant',
      { dayId: 'some-day' },
      {
        addToTrip: async () => ({ status: 'error', error: { message: 'We could not find that place.' } }),
        findFiledIdeaId: async () => null,
        moveToDay: async () => {
          moveCalled = true;
        },
      }
    );
    expect(result.ok).toBe(false);
    expect(moveCalled).toBe(false);
  });
});
