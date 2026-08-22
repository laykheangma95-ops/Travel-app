// ─────────────────────────────────────────────────────────────────────────────
// savePlaceForTraveler against a REAL Postgres, with the REAL policies.
//
// tests/savedPlaces.test.ts proves the control flow using a fake client that
// grants every write. This file proves what the database actually does: the
// migrations in git are applied to Postgres (via PGlite), every statement runs
// as the `authenticated` role carrying a real JWT claim, and Row Level Security
// decides what is allowed. Nothing here is mocked away.
//
// Two of these tests assert a FAILURE. That is deliberate — they pin down the
// two things that block this feature from working in production, so the day
// someone fixes a policy the test turns red and tells them to update it.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addIdeaToTrip, savePlaceForTraveler, type SavePlaceInput } from '@/lib/travel/savedPlaces';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const WAT_PHO: SavePlaceInput = {
  destination: 'Thailand',
  contentSlug: 'bangkok:wat-pho',
  name: 'Wat Pho',
  description: 'Reclining Buddha.',
  category: 'spot',
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
});

afterAll(async () => {
  await harness.close();
});

/** What a guide-content seed migration would put in the catalogue up front. */
async function seedEditorialPlace(slug: string, destination = 'Thailand') {
  const rows = await harness.asAdmin(
    `INSERT INTO destination_places
       (destination, name, category, lat, lng, description, source, created_by, content_slug)
     VALUES ($1, 'Wat Pho', 'spot', 0, 0, 'Reclining Buddha.', 'editorial', NULL, $2)
     RETURNING id`,
    [destination, slug]
  );
  return rows[0].id as string;
}

describe('the database itself', () => {
  it('applies migration 011 on top of 007/009/010', async () => {
    const columns = await harness.asAdmin(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE (table_name = 'destination_places' AND column_name = 'content_slug')
           OR (table_name = 'trip_plans' AND column_name = 'is_wishlist')`
    );
    expect(columns).toHaveLength(2);
  });

  it("accepts every category ItineraryCategory declares, 'stay' included", async () => {
    // Migration 008 widened the CHECK to match the TypeScript union. If the two
    // ever drift apart again, saving a hotel is what breaks.
    for (const category of ['spot', 'food', 'shopping', 'transport', 'stay', 'other']) {
      await harness.asAdmin(
        `INSERT INTO destination_places (destination,name,category,lat,lng,description,source)
         VALUES ('Thailand',$1,$2,0,0,'','editorial')`,
        [`place-${category}`, category]
      );
    }
    expect(await harness.rows('destination_places')).toHaveLength(6);
  });

  it('enforces RLS rather than running as a superuser', async () => {
    // If this ever reports `postgres`/`on`, every policy assertion below is
    // meaningless, because superusers bypass RLS.
    const client = harness.clientFor(ALICE);
    await client.from('trip_plans').select('id');
    const who = await harness.db.query<{ current_user: string; su: string }>(
      `SELECT current_user, current_setting('is_superuser') AS su`
    );
    expect(who.rows[0].current_user).toBe('authenticated');
    expect(who.rows[0].su).toBe('off');
  });

  it('shows the editorial catalogue to everyone and private places to nobody else', async () => {
    await seedEditorialPlace('bangkok:wat-pho');
    await harness.asAdmin(
      `INSERT INTO destination_places
         (destination,name,category,lat,lng,description,source,created_by,content_slug)
       VALUES ('Thailand','Alice hotel','stay',0,0,'','editorial',$1,'private:alice-hotel')`,
      [ALICE]
    );

    const seenByBob = await harness.clientFor(BOB).from('destination_places').select('name');
    expect((seenByBob.data ?? []).map((row) => row.name)).toEqual(['Wat Pho']);

    const seenByAlice = await harness.clientFor(ALICE).from('destination_places').select('name');
    expect((seenByAlice.data ?? []).map((row) => row.name).sort()).toEqual(['Alice hotel', 'Wat Pho']);
  });
});

describe('savePlaceForTraveler, catalogue already seeded', () => {
  // This is the shape the feature takes under option B: guide entries are in
  // the catalogue up front, so saving only ever reads them.

  it('creates a wishlist trip and files the place, under real RLS', async () => {
    const placeId = await seedEditorialPlace('bangkok:wat-pho');

    const result = await savePlaceForTraveler(harness.clientFor(ALICE), ALICE, WAT_PHO);

    expect(result).toMatchObject({ status: 'saved', createdTrip: true, tripTitle: 'Thailand trip' });

    const trips = await harness.rows('trip_plans');
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      user_id: ALICE,
      destination: 'Thailand',
      is_wishlist: true,
      start_date: null,
      end_date: null,
      travelers: 1,
    });

    const days = await harness.rows('itinerary_days');
    expect(days).toHaveLength(1);
    expect(days[0].day_index).toBe(0);

    const filed = await harness.rows('itinerary_places');
    expect(filed).toHaveLength(1);
    expect(filed[0].place_id).toBe(placeId);
    expect(filed[0].sort_order).toBe(0);
  });

  it('reuses one catalogue row and one trip when the same place is saved twice', async () => {
    await seedEditorialPlace('bangkok:wat-pho');
    const client = harness.clientFor(ALICE);

    const first = await savePlaceForTraveler(client, ALICE, WAT_PHO);
    const second = await savePlaceForTraveler(client, ALICE, WAT_PHO);

    expect(first).toMatchObject({ status: 'saved', createdTrip: true });
    expect(second).toMatchObject({ status: 'saved', createdTrip: false });
    if (first.status !== 'saved' || second.status !== 'saved') throw new Error('unreachable');
    expect(second.tripId).toBe(first.tripId);

    expect(await harness.rows('destination_places')).toHaveLength(1);
    expect(await harness.rows('trip_plans')).toHaveLength(1);
    expect((await harness.rows('itinerary_places')).map((row) => row.sort_order)).toEqual([0, 1]);
  });

  it('gives two travelers separate trips off the one shared catalogue row', async () => {
    await seedEditorialPlace('bangkok:wat-pho');

    const forAlice = await savePlaceForTraveler(harness.clientFor(ALICE), ALICE, WAT_PHO);
    const forBob = await savePlaceForTraveler(harness.clientFor(BOB), BOB, WAT_PHO);

    if (forAlice.status !== 'saved' || forBob.status !== 'saved') throw new Error('unreachable');
    expect(forAlice.tripId).not.toBe(forBob.tripId);
    expect(await harness.rows('destination_places')).toHaveLength(1);

    const trips = await harness.rows('trip_plans');
    expect(trips.map((row) => row.user_id).sort()).toEqual([ALICE, BOB].sort());
  });

  it('asks which trip when two are open, and writes nothing', async () => {
    await seedEditorialPlace('bangkok:wat-pho');
    const client = harness.clientFor(ALICE);
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'Songkran', destination: 'Thailand', end_date: '2099-04-20' });
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'Islands', destination: 'Thailand', end_date: null });

    const result = await savePlaceForTraveler(client, ALICE, WAT_PHO);

    expect(result.status).toBe('needsChoice');
    if (result.status !== 'needsChoice') throw new Error('unreachable');
    expect(result.candidates.map((trip) => trip.title).sort()).toEqual(['Islands', 'Songkran']);

    expect(await harness.rows('trip_plans')).toHaveLength(2);
    expect(await harness.rows('itinerary_days')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('ignores a trip that has already ended, and matches destination case-insensitively', async () => {
    await seedEditorialPlace('bangkok:wat-pho', 'thailand');
    const client = harness.clientFor(ALICE);
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'Last year', destination: 'Thailand', end_date: '2020-01-05' });
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'Songkran', destination: 'thailand', end_date: '2099-04-20' });

    const result = await savePlaceForTraveler(client, ALICE, { ...WAT_PHO, destination: 'THAILAND' });

    expect(result).toMatchObject({ status: 'saved', tripTitle: 'Songkran', createdTrip: false });
    expect(await harness.rows('trip_plans')).toHaveLength(2);
  });
});

describe("addIdeaToTrip keeps the itinerary route's guarantees", () => {
  it("refuses another traveler's trip", async () => {
    const trips = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Alice trip','Thailand') RETURNING id`,
      [ALICE]
    );
    const placeId = await seedEditorialPlace('bangkok:wat-pho');

    // Bob cannot even see Alice's trip, so this stops at the trip lookup.
    await expect(
      addIdeaToTrip(harness.clientFor(BOB), trips[0].id as string, placeId)
    ).rejects.toThrow('That trip could not be found.');
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('refuses a place from a different destination', async () => {
    const trips = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Thailand trip','Thailand') RETURNING id`,
      [ALICE]
    );
    const placeId = await seedEditorialPlace('tokyo:senso-ji', 'Japan');

    await expect(
      addIdeaToTrip(harness.clientFor(ALICE), trips[0].id as string, placeId)
    ).rejects.toThrow('That place could not be found.');
  });
});

describe('BLOCKED until a decision is made', () => {
  // ── Blocker 1 ──────────────────────────────────────────────────────────────
  // createPlace() inserts with created_by NULL. The only INSERT policy on the
  // table is destination_places_insert_own — WITH CHECK (created_by = auth.uid())
  // — and NULL fails it. Delete this test once a policy allows the insert.
  it('rejects a traveler creating an editorial catalogue row', async () => {
    const client = harness.clientFor(ALICE);
    const { error } = await client.from('destination_places').insert({
      destination: 'Thailand', name: 'Wat Pho', category: 'spot', lat: 0, lng: 0,
      description: '', source: 'editorial', created_by: null, content_slug: 'bangkok:wat-pho',
    });

    expect(error).not.toBeNull();
    expect((error as { message: string }).message).toMatch(/row-level security policy/);
    expect(await harness.rows('destination_places')).toHaveLength(0);
  });

  it('cannot save a place that is not already in the catalogue', async () => {
    // The end-to-end consequence of blocker 1: with nothing seeded, the save
    // fails outright. Note the trip is still created first — see the report.
    await expect(savePlaceForTraveler(harness.clientFor(ALICE), ALICE, WAT_PHO)).rejects.toThrow(
      'Could not save that place.'
    );
  });

  // ── Blocker 2 ──────────────────────────────────────────────────────────────
  // Migration 011's unique index is PARTIAL (WHERE content_slug IS NOT NULL).
  // Postgres will only infer a partial index if the statement repeats that
  // predicate, and supabase-js's .upsert({ onConflict }) cannot emit one — so
  // the "idempotent under concurrent calls" behaviour does not work today.
  it('cannot infer the partial unique index from ON CONFLICT (content_slug)', async () => {
    await seedEditorialPlace('bangkok:wat-pho');

    await expect(
      harness.asAdmin(
        `INSERT INTO destination_places
           (destination,name,category,lat,lng,description,source,created_by,content_slug)
         VALUES ('Thailand','Wat Pho','spot',0,0,'','editorial',NULL,'bangkok:wat-pho')
         ON CONFLICT (content_slug) DO NOTHING`
      )
    ).rejects.toThrow(/no unique or exclusion constraint matching the ON CONFLICT/);

    // Spelling the predicate out works — which is what a fix would have to do.
    await expect(
      harness.asAdmin(
        `INSERT INTO destination_places
           (destination,name,category,lat,lng,description,source,created_by,content_slug)
         VALUES ('Thailand','Wat Pho','spot',0,0,'','editorial',NULL,'bangkok:wat-pho')
         ON CONFLICT (content_slug) WHERE content_slug IS NOT NULL DO NOTHING`
      )
    ).resolves.toBeDefined();

    expect(await harness.rows('destination_places')).toHaveLength(1);
  });
});
