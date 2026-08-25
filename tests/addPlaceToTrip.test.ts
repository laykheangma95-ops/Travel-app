// ─────────────────────────────────────────────────────────────────────────────
// POST /api/travel/places/:id/add-to-trip — Phase 10.
//
// Same shape as tests/savePlaceRoute.test.ts (the exported handler, driven with
// a session client backed by real Postgres and real RLS) crossed with
// tests/placeDetailRoute.test.ts's adversarial style (perform the attack, not
// describe it): a canonical place's authorization boundary is the same
// `places_read_public_or_own` this repo already tested there, and this route's
// whole job is to reuse it correctly rather than reinvent it — so these tests
// prove exactly that reuse, not just that a happy path works.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { promotePlace, resolveProviderPlace } from '@/lib/places/repository';
import type { ProviderPlace } from '@/lib/providers/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '', signedIn: true }));

vi.mock('@/lib/supabase', () => ({
  // Configured, but the route must never use it for anything but the
  // configuration check: every read and write goes through the caller's own
  // session client so RLS applies — never the service role. The adversarial
  // tests below (another traveler's place, another traveler's trip) are what
  // actually prove that, not this mock.
  getSupabase: () => ({}),
}));

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!session.signedIn) {
      const { ApiError } = await import('@/lib/http');
      throw new ApiError('UNAUTHORIZED', 'Sign in to add places to a trip.');
    }
    return { id: session.userId };
  },
  supabaseFromRequest: () => session.client,
}));

const { POST } = await import('@/app/api/travel/places/[id]/add-to-trip/route');

let harness: Harness;

function post(placeId: string, body: unknown = {}) {
  return POST(
    new Request(`https://domner.test/api/travel/places/${placeId}/add-to-trip`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.51' },
      body: JSON.stringify(body),
    }),
    { params: { id: placeId } }
  );
}

function signIn(userId: string) {
  session.signedIn = true;
  session.userId = userId;
  session.client = harness.clientFor(userId);
}

const WAT_PHO: ProviderPlace = {
  providerId: 'sandbox',
  providerPlaceId: 'p-wat-pho',
  name: 'Wat Pho',
  localName: 'วัดโพธิ์',
  countryCode: 'TH',
  countryName: 'Thailand',
  city: 'Bangkok',
  district: null,
  neighborhood: null,
  latitude: 13.7465,
  longitude: 100.4927,
  address: '2 Sanamchai Road, Bangkok',
  website: 'https://www.watpho.com',
  phone: null,
  priceLevel: null,
  category: 'spot',
  subcategory: null,
};

/** A published (`domner_public`) canonical place, visible to every traveler. */
async function publishedPlace(overrides: Partial<ProviderPlace> = {}): Promise<string> {
  const service = harness.serviceClient();
  const resolved = await resolveProviderPlace(service, { ...WAT_PHO, ...overrides });
  await promotePlace(service, resolved!.place.id, 'domner_public', {
    actor: 'staff:test',
    reason: 'fixture',
  });
  return resolved!.place.id;
}

/** A place owned by (and visible only to) one traveler — never published. */
async function privatePlace(ownerId: string, slug: string, name = 'Private Idea'): Promise<string> {
  const rows = await harness.asAdmin(
    `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
     VALUES ($1,$2,'Thailand','food',13.1,100.1,$3) RETURNING id`,
    [slug, name, ownerId]
  );
  return rows[0].id as string;
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

describe('adding an authorized canonical place to a trip', () => {
  it('A. starts a wishlist trip on the first add and files the place', async () => {
    const placeId = await publishedPlace();

    const response = await post(placeId);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      status: 'added',
      createdTrip: true,
      alreadyAdded: false,
      tripTitle: 'Thailand trip',
    });

    const trips = await harness.rows('trip_plans');
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ user_id: ALICE, destination: 'Thailand', is_wishlist: true });

    expect(await harness.rows('itinerary_places')).toHaveLength(1);
  });

  it('B. materializes a destination_places row owned by the caller, linked to the canonical place, with trusted fields carried over', async () => {
    const placeId = await publishedPlace();

    await post(placeId);

    const rows = await harness.rows('destination_places');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      created_by: ALICE,
      canonical_place_id: placeId,
      destination: 'Thailand',
      name: 'Wat Pho',
      category: 'spot',
      source: 'ai_generated',
    });
    expect(Number(rows[0].lat)).toBeCloseTo(13.7465, 4);
    expect(Number(rows[0].lng)).toBeCloseTo(100.4927, 4);
  });

  it('C. adding the same place to the same trip twice is idempotent — no duplicate itinerary row', async () => {
    const placeId = await publishedPlace();

    const first = await (await post(placeId)).json();
    const second = await (await post(placeId)).json();

    expect(first.alreadyAdded).toBe(false);
    expect(second.alreadyAdded).toBe(true);
    expect(second.tripId).toBe(first.tripId);
    expect(await harness.rows('itinerary_places')).toHaveLength(1);
    expect(await harness.rows('trip_plans')).toHaveLength(1);
  });

  it('D. reuses the existing traveler-owned destination_places row rather than duplicating it, across two trips', async () => {
    const placeId = await publishedPlace();
    const trips = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,end_date) VALUES
         ($1,'Songkran','Thailand','2099-04-20'), ($1,'Islands','Thailand',NULL) RETURNING id,title`,
      [ALICE]
    );
    const songkran = trips.find((row) => row.title === 'Songkran')!;
    const islands = trips.find((row) => row.title === 'Islands')!;

    await post(placeId, { tripId: songkran.id });
    await post(placeId, { tripId: islands.id });

    // One catalogue row for Alice's copy of this canonical place, filed onto
    // both trips — not one row per trip.
    expect(await harness.rows('destination_places')).toHaveLength(1);
    expect(await harness.rows('itinerary_places')).toHaveLength(2);
  });

  it('reuses the traveler-owned row even when a same-named, unrelated row already exists (owner_name_idx collision)', async () => {
    const placeId = await publishedPlace();
    // Alice already has her own catalogue entry with the exact same name for
    // the same destination — e.g. a manual add from before this canonical
    // place ever existed for her.
    await harness.asAdmin(
      `INSERT INTO destination_places (destination,name,category,lat,lng,description,created_by)
       VALUES ('Thailand','Wat Pho','food',0,0,'',$1)`,
      [ALICE]
    );

    const response = await post(placeId);
    expect(response.status).toBe(200);

    const rows = await harness.rows('destination_places');
    expect(rows).toHaveLength(1);
    expect(rows[0].canonical_place_id).toBe(placeId);
    expect(await harness.rows('itinerary_places')).toHaveLength(1);
  });
});

describe('authorization — a UUID is never treated as proof of anything', () => {
  it("E. cannot add another traveler's private, unverified canonical place", async () => {
    const bobsPlace = await privatePlace(BOB, 't:bob-secret');

    const response = await post(bobsPlace);
    expect(response.status).toBe(404);
    expect(await harness.rows('destination_places')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
    expect(await harness.rows('trip_plans')).toHaveLength(0);
  });

  it('F. cannot add a random, nonexistent canonical place id', async () => {
    const response = await post(crypto.randomUUID());
    expect(response.status).toBe(404);
    expect(await harness.rows('destination_places')).toHaveLength(0);
  });

  it('answers 404 rather than 400 for a malformed place id', async () => {
    expect((await post('not-a-uuid')).status).toBe(404);
  });

  it("G. a tripId belonging to another traveler is rejected — RLS hides it, so it 404s like an unknown trip", async () => {
    const placeId = await publishedPlace();
    const bobsTrip = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Bob trip','Thailand') RETURNING id`,
      [BOB]
    );

    const response = await post(placeId, { tripId: bobsTrip[0].id });
    expect(response.status).toBe(404);
    expect(await harness.rows('destination_places')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('cannot be reached via a forged canonical_place_id pointer on an unrelated destination_places row', async () => {
    // Same finding tests/placeDetailRoute.test.ts proves for the read side:
    // the FK lets Alice point her own row at Bob's private place, but that
    // pointer buys nothing here either — getPlaceById re-derives visibility
    // from `places` RLS on the id in the URL, never from an existing pointer.
    const bobsPlace = await privatePlace(BOB, 't:bob-secret-2', 'Bob Secret 2');
    const alice = harness.clientFor(ALICE);
    const destRow = await harness
      .asAdmin(
        `INSERT INTO destination_places (destination,name,category,lat,lng,description,created_by)
         VALUES ('Thailand','Alices Idea','food',13.2,100.2,'',$1) RETURNING id`,
        [ALICE]
      )
      .then((rows) => rows[0].id as string);
    await alice.from('destination_places').update({ canonical_place_id: bobsPlace }).eq('id', destRow);

    const response = await post(bobsPlace);
    expect(response.status).toBe(404);
  });

  it('requires an account', async () => {
    const placeId = await publishedPlace();
    session.signedIn = false;
    const response = await post(placeId);
    expect(response.status).toBe(401);
    session.signedIn = true;
  });

  it('rejects a malformed body', async () => {
    const placeId = await publishedPlace();
    // .strict(): an unknown key is refused, not silently ignored.
    expect((await post(placeId, { tripId: 'nope' })).status).toBe(400);
    expect((await post(placeId, { userId: BOB })).status).toBe(400);
    expect(await harness.rows('trip_plans')).toHaveLength(0);
  });
});

describe('multiple eligible trips', () => {
  it('H. returns needsChoice and writes nothing when more than one trip is open', async () => {
    const placeId = await publishedPlace();
    await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,end_date) VALUES
         ($1,'Songkran','Thailand','2099-04-20'), ($1,'Islands','Thailand',NULL)`,
      [ALICE]
    );

    const response = await post(placeId);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('needsChoice');
    expect(body.candidates.map((trip: { title: string }) => trip.title).sort()).toEqual([
      'Islands',
      'Songkran',
    ]);
    expect(await harness.rows('destination_places')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('I. succeeds once a trip is chosen after needsChoice', async () => {
    const placeId = await publishedPlace();
    const trips = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,end_date) VALUES
         ($1,'Songkran','Thailand','2099-04-20'), ($1,'Islands','Thailand',NULL) RETURNING id,title`,
      [ALICE]
    );
    const islands = trips.find((row) => row.title === 'Islands')!;

    const body = await (await post(placeId, { tripId: islands.id })).json();

    expect(body).toMatchObject({ status: 'added', tripId: islands.id, tripTitle: 'Islands' });
    const days = await harness.rows('itinerary_days');
    expect(days).toHaveLength(1);
    expect(days[0].trip_id).toBe(islands.id);
  });
});

describe('rate limiting', () => {
  it('rate limits a client hammering add-to-trip', async () => {
    const placeId = await publishedPlace();
    let last = await post(placeId);
    for (let attempt = 1; attempt < 30; attempt += 1) last = await post(placeId);
    expect(last.status).toBe(200);
    expect((await post(placeId)).status).toBe(429);
  });
});
