// ─────────────────────────────────────────────────────────────────────────────
// POST /api/travel/places/save, end to end.
//
// Same shape as tests/itineraryRoute.test.ts: the exported handler, driven with
// a session client backed by real Postgres and real RLS. Only getSupabase and
// requireUser/supabaseFromRequest are replaced — an env check and JWT-cookie
// parsing. Zod validation, the rate limiter and the error envelope are real.
//
// The catalogue is loaded from the actual generated seed file, so these tests
// save the same rows a traveler would.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '', signedIn: true }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!session.signedIn) {
      const { ApiError } = await import('@/lib/http');
      throw new ApiError('UNAUTHORIZED', 'Sign in to save places.');
    }
    return { id: session.userId };
  },
  supabaseFromRequest: () => session.client,
}));

const { POST } = await import('@/app/api/travel/places/save/route');

let harness: Harness;

function post(body: unknown) {
  return POST(
    new Request('https://domner.test/api/travel/places/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.44' },
      body: JSON.stringify(body),
    })
  );
}

function signIn(userId: string) {
  session.signedIn = true;
  session.userId = userId;
  session.client = harness.clientFor(userId);
}

const WAT_PHO = { destination: 'Thailand', contentSlug: 'thailand:wat-pho' };

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  // The real catalogue, exactly as production is seeded.
  await harness.asAdmin(
    await readFile(join(process.cwd(), 'supabase', 'seeds', 'destination_places.sql'), 'utf8')
  );
  signIn(ALICE);
});

afterAll(async () => {
  await harness.close();
});

describe('saving a place from a guide', () => {
  it('starts a wishlist trip on the first save and files the place', async () => {
    const response = await post(WAT_PHO);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      status: 'saved',
      createdTrip: true,
      alreadySaved: false,
      tripTitle: 'Thailand trip',
    });

    const trips = await harness.rows('trip_plans');
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ user_id: ALICE, destination: 'Thailand', is_wishlist: true });

    const filed = await harness.rows('itinerary_places');
    expect(filed).toHaveLength(1);
  });

  it('is idempotent — a double tap does not file it twice', async () => {
    const first = await (await post(WAT_PHO)).json();
    const second = await (await post(WAT_PHO)).json();

    expect(first.alreadySaved).toBe(false);
    expect(second.alreadySaved).toBe(true);
    expect(second.tripId).toBe(first.tripId);
    expect(second.createdTrip).toBe(false);
    expect(await harness.rows('itinerary_places')).toHaveLength(1);
    expect(await harness.rows('trip_plans')).toHaveLength(1);
  });

  it('does not re-file a place the traveler already scheduled on a real day', async () => {
    await post(WAT_PHO);
    // Move it out of Ideas onto day 1, the way the itinerary builder would.
    const trip = (await harness.rows('trip_plans'))[0];
    const day = await harness.asAdmin(
      `INSERT INTO itinerary_days (trip_id, day_index) VALUES ($1, 1) RETURNING id`,
      [trip.id]
    );
    await harness.asAdmin(`UPDATE itinerary_places SET itinerary_day_id = $1, sort_order = 0`, [
      day[0].id,
    ]);

    const again = await (await post(WAT_PHO)).json();

    expect(again.alreadySaved).toBe(true);
    expect(await harness.rows('itinerary_places')).toHaveLength(1);
  });

  it('asks which trip when two are open, writing nothing', async () => {
    await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,end_date) VALUES
         ($1,'Songkran','Thailand','2099-04-20'), ($1,'Islands','Thailand',NULL)`,
      [ALICE]
    );

    const response = await post(WAT_PHO);
    // Not an error: nothing went wrong, the answer is a question.
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('needsChoice');
    expect(body.candidates.map((trip: { title: string }) => trip.title).sort()).toEqual([
      'Islands',
      'Songkran',
    ]);
    expect(await harness.rows('itinerary_days')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('saves onto the trip the traveler picked', async () => {
    const trips = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,end_date) VALUES
         ($1,'Songkran','Thailand','2099-04-20'), ($1,'Islands','Thailand',NULL) RETURNING id,title`,
      [ALICE]
    );
    const islands = trips.find((row) => row.title === 'Islands')!;

    const body = await (await post({ ...WAT_PHO, tripId: islands.id })).json();

    expect(body).toMatchObject({ status: 'saved', tripId: islands.id, tripTitle: 'Islands' });
    const days = await harness.rows('itinerary_days');
    expect(days).toHaveLength(1);
    expect(days[0].trip_id).toBe(islands.id);
  });

  it("refuses a trip that is not the traveler's, even when named directly", async () => {
    const bobs = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Bob trip','Thailand') RETURNING id`,
      [BOB]
    );

    const response = await post({ ...WAT_PHO, tripId: bobs[0].id });

    // RLS hides it, so it cannot even be named.
    expect(response.status).toBe(404);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });
});

describe('what the endpoint refuses', () => {
  it('requires an account', async () => {
    session.signedIn = false;
    const response = await post(WAT_PHO);
    expect(response.status).toBe(401);
    session.signedIn = true;
  });

  it('rejects a slug that is not in the catalogue', async () => {
    const response = await post({ destination: 'Thailand', contentSlug: 'thailand:not-real' });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe('That place is not in our guide yet.');
    expect(await harness.rows('trip_plans')).toHaveLength(0);
  });

  it('rejects a slug from another country', async () => {
    const response = await post({ destination: 'Thailand', contentSlug: 'japan:sensoji-temple' });
    expect(response.status).toBe(400);
    expect(await harness.rows('trip_plans')).toHaveLength(0);
  });

  it('rejects a malformed body', async () => {
    // Not a slug shape at all.
    expect((await post({ destination: 'Thailand', contentSlug: 'Wat Pho' })).status).toBe(400);
    // Missing destination.
    expect((await post({ contentSlug: 'thailand:wat-pho' })).status).toBe(400);
    // .strict(): an extra key means a client that is out of date, or one trying
    // to describe a place rather than name it.
    expect((await post({ ...WAT_PHO, name: 'Something else' })).status).toBe(400);
    // A tripId that is not a uuid never reaches the database.
    expect((await post({ ...WAT_PHO, tripId: 'nope' })).status).toBe(400);

    expect(await harness.rows('trip_plans')).toHaveLength(0);
  });

  it('rate limits a client hammering save', async () => {
    let last = await post(WAT_PHO);
    for (let attempt = 1; attempt < 30; attempt += 1) last = await post(WAT_PHO);
    expect(last.status).toBe(200);
    expect((await post(WAT_PHO)).status).toBe(429);
  });
});
