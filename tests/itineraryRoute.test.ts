// ─────────────────────────────────────────────────────────────────────────────
// The itinerary PATCH route, end to end.
//
// This is the last seam the other two suites leave open. tests/savedPlaces.test.ts
// proves control flow against a fake; tests/savedPlaces.rls.test.ts proves the
// database's half against real Postgres. Neither runs the ROUTE — the zod
// validation, the rate limiter, requireParam, the error envelope, and the
// snapshot that comes back in the response body.
//
// So this drives the exported PATCH handler itself, with a session client backed
// by real Postgres and real RLS. Only the two seams that cannot exist in a test
// process are replaced: getSupabase() (an env check) and requireUser/
// supabaseFromRequest (which parse a Supabase JWT out of a cookie). Everything
// past that point is the real code path a browser request takes.
//
// It is here rather than in the savedPlaces files because it covers the route,
// not the module: the addIdea branch is the part Part A refactored, and this is
// what proves that refactor kept the route's contract.
// ─────────────────────────────────────────────────────────────────────────────

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits, RATE_LIMITS } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

// vi.mock factories are hoisted above the imports, so the values they close over
// have to be hoisted too.
const session = vi.hoisted(() => ({
  client: null as unknown,
  userId: '',
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({}),
}));

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: session.userId }),
  supabaseFromRequest: () => session.client,
}));

// Imported after the mocks are registered.
const { PATCH } = await import('@/app/api/travel/itinerary/[tripId]/route');

let harness: Harness;

function patch(tripId: string, body: unknown) {
  const request = new Request(`https://domner.test/api/travel/itinerary/${tripId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: { tripId } });
}

/** Sign the next request in as this traveler. */
function signIn(userId: string) {
  session.userId = userId;
  session.client = harness.clientFor(userId);
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  signIn(ALICE);
});

afterAll(async () => {
  await harness.close();
});

async function seedTrip(userId: string, destination = 'Thailand') {
  const rows = await harness.asAdmin(
    `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Thailand trip',$2) RETURNING id`,
    [userId, destination]
  );
  return rows[0].id as string;
}

async function seedPlace(name = 'Wat Pho', destination = 'Thailand', category = 'spot') {
  const rows = await harness.asAdmin(
    `INSERT INTO destination_places (destination,name,category,lat,lng,description,source,content_slug)
     VALUES ($1,$2,$3,13.7465,100.4927,'','editorial',$4) RETURNING id`,
    [destination, name, category, `${destination.toLowerCase()}:${name.toLowerCase().replace(/ /g, '-')}`]
  );
  return rows[0].id as string;
}

describe('PATCH addIdea', () => {
  it('files the place and returns the refreshed snapshot', async () => {
    const tripId = await seedTrip(ALICE);
    const placeId = await seedPlace();

    const response = await patch(tripId, { action: 'addIdea', placeId });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.trip.id).toBe(tripId);
    expect(body.ideas).toHaveLength(1);
    expect(body.ideas[0].place.name).toBe('Wat Pho');
    // The Ideas bucket is day_index 0 and must never surface as a numbered day.
    expect(body.days).toEqual([]);
    expect(body.curatedPlaces.map((place: { id: string }) => place.id)).toEqual([placeId]);

    expect(await harness.rows('itinerary_places')).toHaveLength(1);
  });

  it('creates the Ideas day once, then appends to it', async () => {
    const tripId = await seedTrip(ALICE);
    const first = await seedPlace('Wat Pho');
    const second = await seedPlace('Wat Arun');

    await patch(tripId, { action: 'addIdea', placeId: first });
    const response = await patch(tripId, { action: 'addIdea', placeId: second });

    expect(response.status).toBe(200);
    expect(await harness.rows('itinerary_days')).toHaveLength(1);
    const filed = await harness.rows('itinerary_places');
    expect(filed.map((row) => row.sort_order).sort()).toEqual([0, 1]);
  });

  it("will not touch another traveler's trip", async () => {
    const tripId = await seedTrip(BOB);
    const placeId = await seedPlace();

    // Alice is signed in; RLS hides Bob's trip from her session entirely.
    const response = await patch(tripId, { action: 'addIdea', placeId });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('refuses a place from another destination', async () => {
    const tripId = await seedTrip(ALICE);
    const placeId = await seedPlace('Senso-ji', 'Japan');

    const response = await patch(tripId, { action: 'addIdea', placeId });

    expect(response.status).toBe(404);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('rejects a malformed body before touching the database', async () => {
    const tripId = await seedTrip(ALICE);

    const notAUuid = await patch(tripId, { action: 'addIdea', placeId: 'not-a-uuid' });
    expect(notAUuid.status).toBe(400);

    const unknownAction = await patch(tripId, { action: 'teleport' });
    expect(unknownAction.status).toBe(400);

    // .strict() on the schema: an extra key is a client that is out of date.
    const extraKey = await patch(tripId, {
      action: 'addIdea',
      placeId: '10000000-0000-4000-8000-000000000001',
      sortOrder: 3,
    });
    expect(extraKey.status).toBe(400);

    expect(await harness.rows('itinerary_days')).toHaveLength(0);
  });

  it('rate limits a client hammering the endpoint', async () => {
    const tripId = await seedTrip(ALICE);
    const placeId = await seedPlace();
    const limit = RATE_LIMITS.tripWrite.limit;

    let last = await patch(tripId, { action: 'addIdea', placeId });
    for (let attempt = 1; attempt < limit; attempt += 1) {
      last = await patch(tripId, { action: 'addIdea', placeId });
    }
    expect(last.status).toBe(200);

    const blocked = await patch(tripId, { action: 'addIdea', placeId });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('PATCH, the branches addIdea sits beside', () => {
  // Part A moved one branch out of this handler. These cover the neighbours, so
  // a later refactor of the same file cannot quietly break them either.

  it('adds a numbered day and dates it from the trip start', async () => {
    const rows = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,start_date)
       VALUES ($1,'Thailand trip','Thailand','2026-04-10') RETURNING id`,
      [ALICE]
    );
    const tripId = rows[0].id as string;

    const response = await patch(tripId, { action: 'addDay' });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.days).toHaveLength(1);
    expect(body.days[0].day_index).toBe(1);
    expect(body.days[0].date).toBe('2026-04-10');
  });

  it('shares and unshares a trip', async () => {
    const tripId = await seedTrip(ALICE);

    await patch(tripId, { action: 'share' });
    expect((await harness.rows('trip_plans'))[0].is_public).toBe(true);

    await patch(tripId, { action: 'unshare' });
    expect((await harness.rows('trip_plans'))[0].is_public).toBe(false);
  });
});
