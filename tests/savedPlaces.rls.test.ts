// ─────────────────────────────────────────────────────────────────────────────
// savePlaceForTraveler against a REAL Postgres, with the REAL policies.
//
// tests/savedPlaces.test.ts proves the control flow using a fake client that
// grants every write. This file proves what the database actually does: the
// migrations in git are applied to Postgres (via PGlite), every statement runs
// as the `authenticated` role carrying a real JWT claim, and Row Level Security
// decides what is allowed. Nothing here is mocked away.
//
// It also applies the real generated seed file, supabase/seeds/destination_places.sql,
// so the catalogue this feature depends on is checked end to end: it applies, it
// re-runs without duplicating, and it backfills slugs onto rows that were seeded
// before migration 011 existed.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addIdeaToTrip, savePlaceForTraveler, type SavePlaceInput } from '@/lib/travel/savedPlaces';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const WAT_PHO: SavePlaceInput = { destination: 'Thailand', contentSlug: 'thailand:wat-pho' };

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

/** One catalogue row, as the generated seed file would have written it. */
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
    await seedEditorialPlace('thailand:wat-pho');
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
    const placeId = await seedEditorialPlace('thailand:wat-pho');

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

  it('files a place once however many times it is saved', async () => {
    await seedEditorialPlace('thailand:wat-pho');
    const client = harness.clientFor(ALICE);

    const first = await savePlaceForTraveler(client, ALICE, WAT_PHO);
    const second = await savePlaceForTraveler(client, ALICE, WAT_PHO);

    expect(first).toMatchObject({ status: 'saved', createdTrip: true, alreadySaved: false });
    expect(second).toMatchObject({ status: 'saved', createdTrip: false, alreadySaved: true });
    if (first.status !== 'saved' || second.status !== 'saved') throw new Error('unreachable');
    expect(second.tripId).toBe(first.tripId);

    expect(await harness.rows('destination_places')).toHaveLength(1);
    expect(await harness.rows('trip_plans')).toHaveLength(1);
    expect((await harness.rows('itinerary_places')).map((row) => row.sort_order)).toEqual([0]);
  });

  it('gives two travelers separate trips off the one shared catalogue row', async () => {
    await seedEditorialPlace('thailand:wat-pho');

    const forAlice = await savePlaceForTraveler(harness.clientFor(ALICE), ALICE, WAT_PHO);
    const forBob = await savePlaceForTraveler(harness.clientFor(BOB), BOB, WAT_PHO);

    if (forAlice.status !== 'saved' || forBob.status !== 'saved') throw new Error('unreachable');
    expect(forAlice.tripId).not.toBe(forBob.tripId);
    expect(await harness.rows('destination_places')).toHaveLength(1);

    const trips = await harness.rows('trip_plans');
    expect(trips.map((row) => row.user_id).sort()).toEqual([ALICE, BOB].sort());
  });

  it('asks which trip when two are open, and writes nothing', async () => {
    await seedEditorialPlace('thailand:wat-pho');
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

  it('ignores a trip that has already ended', async () => {
    await seedEditorialPlace('thailand:wat-pho');
    const client = harness.clientFor(ALICE);
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'Last year', destination: 'Thailand', end_date: '2020-01-05' });
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'Songkran', destination: 'Thailand', end_date: '2099-04-20' });

    const result = await savePlaceForTraveler(client, ALICE, WAT_PHO);

    expect(result).toMatchObject({ status: 'saved', tripTitle: 'Songkran', createdTrip: false });
    expect(await harness.rows('trip_plans')).toHaveLength(2);
  });

  it('leaves a case-mismatched trip alone and makes one that works', async () => {
    await seedEditorialPlace('thailand:wat-pho');
    const client = harness.clientFor(ALICE);
    await client.from('trip_plans').insert({ user_id: ALICE, title: 'songkran', destination: 'thailand', end_date: null });

    const result = await savePlaceForTraveler(client, ALICE, WAT_PHO);

    expect(result).toMatchObject({ status: 'saved', createdTrip: true });
    const trips = await harness.rows('trip_plans');
    expect(trips).toHaveLength(2);
    // The place is filed against the canonical trip, the one whose add-place
    // sheet will actually list this country's catalogue.
    const filed = await harness.rows('itinerary_places');
    expect(filed).toHaveLength(1);
  });
});

describe("addIdeaToTrip keeps the itinerary route's guarantees", () => {
  it("refuses another traveler's trip", async () => {
    const trips = await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Alice trip','Thailand') RETURNING id`,
      [ALICE]
    );
    const placeId = await seedEditorialPlace('thailand:wat-pho');

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
    const placeId = await seedEditorialPlace('japan:senso-ji', 'Japan');

    await expect(
      addIdeaToTrip(harness.clientFor(ALICE), trips[0].id as string, placeId)
    ).rejects.toThrow('That place could not be found.');
  });
});

describe('the catalogue stays closed to travelers', () => {
  // Under option B nobody but the seed writes the catalogue. This is no longer
  // a blocker, it is the property being relied on: a traveler who tried to add
  // an editorial-looking row that every other traveler would see is refused by
  // the database, not by a check in application code that could be bypassed.
  it('refuses a traveler creating an editorial catalogue row', async () => {
    const client = harness.clientFor(ALICE);
    const { error } = await client.from('destination_places').insert({
      destination: 'Thailand', name: 'Wat Pho', category: 'spot', lat: 0, lng: 0,
      description: '', source: 'editorial', created_by: null, content_slug: 'thailand:wat-pho',
    });

    expect(error).not.toBeNull();
    expect((error as { message: string }).message).toMatch(/row-level security policy/);
    expect(await harness.rows('destination_places')).toHaveLength(0);
  });

  it('refuses an unseeded slug without creating a stray trip', async () => {
    await expect(savePlaceForTraveler(harness.clientFor(ALICE), ALICE, WAT_PHO)).rejects.toThrow(
      'That place is not in our guide yet.'
    );
    // The lookup happens before anything is written, so a guide entry that was
    // published without its seed row cannot litter the account with empty trips.
    expect(await harness.rows('trip_plans')).toHaveLength(0);
    expect(await harness.rows('itinerary_days')).toHaveLength(0);
  });

  it('refuses a slug that belongs to a different country', async () => {
    await seedEditorialPlace('japan:senso-ji', 'Japan');
    await expect(
      savePlaceForTraveler(harness.clientFor(ALICE), ALICE, {
        destination: 'Thailand',
        contentSlug: 'japan:senso-ji',
      })
    ).rejects.toThrow('That place does not belong to that destination.');
    expect(await harness.rows('trip_plans')).toHaveLength(0);
  });
});

describe('the generated seed file', () => {
  const seedPath = join(process.cwd(), 'supabase', 'seeds', 'destination_places.sql');

  it('applies, is re-runnable, and gives every row a slug', async () => {
    const seed = await readFile(seedPath, 'utf8');

    await harness.asAdmin(seed);
    const first = await harness.rows('destination_places');
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((row) => typeof row.content_slug === 'string' && row.content_slug)).toBe(true);

    // Applying it twice must not duplicate the catalogue.
    await harness.asAdmin(seed);
    expect(await harness.rows('destination_places')).toHaveLength(first.length);
  });

  it('backfills the slug onto rows that were seeded before migration 011', async () => {
    // Production already holds these rows with content_slug NULL. The seed has
    // to fill them in rather than fail or insert a second copy.
    await harness.asAdmin(
      `INSERT INTO destination_places (destination,name,category,lat,lng,description,photo_url,source)
       VALUES ('Thailand','Wat Pho','spot',13.7465,100.4927,'edited by hand','','editorial')`
    );

    await harness.asAdmin(await readFile(seedPath, 'utf8'));

    const watPho = (await harness.rows('destination_places')).filter((row) => row.name === 'Wat Pho');
    expect(watPho).toHaveLength(1);
    expect(watPho[0].content_slug).toBe('thailand:wat-pho');
    // Only content_slug is written on conflict, so a description someone edited
    // in the database is not silently reverted by re-running the seed.
    expect(watPho[0].description).toBe('edited by hand');
  });

  it('carries a slug for every row, all distinct', async () => {
    await harness.asAdmin(await readFile(seedPath, 'utf8'));
    const rows = await harness.rows('destination_places');
    const slugs = rows.map((row) => row.content_slug);
    expect(new Set(slugs).size).toBe(rows.length);
  });
});
