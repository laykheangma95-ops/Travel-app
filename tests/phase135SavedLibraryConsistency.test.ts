// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 — K, L, M: one saved_places library, two entry points, never
// duplicated by adding to a trip.
//
// The itinerary editor's "Saved" tab used to read the trip's own Ideas list
// (itinerary_places at day_index 0) under the "Saved" label — a different
// data source than /you/saved, which reads saved_places. Phase 13.5 rewires
// the tab to call the SAME route /you/saved already calls
// (GET /api/travel/places/saved) and to add via the SAME route
// /you/saved's AddToTripButton already calls
// (POST /api/travel/places/:id/add-to-trip). This proves that composition at
// the data layer, against real Postgres with real RLS — the two library
// functions those routes are thin wrappers over.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { savePlace, getSavedPlaces } from '@/lib/places/saved';
import { addPlaceToTrip } from '@/lib/places/addToTrip';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
});

afterAll(async () => {
  await harness.close();
});

async function seedPublishedPlace(name = 'Wat Pho', country = 'Thailand') {
  const service = harness.serviceClient();
  const { data } = await service
    .from('places')
    .insert({
      slug: `${country.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      country_name: country,
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'domner_public',
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

describe('K/L: /you/saved and the itinerary "Saved" tab read the same saved_places source', () => {
  it('a heart saved with no trip context is visible through the SAME destination-scoped query the itinerary tab now uses', async () => {
    const alice = harness.clientFor(ALICE);
    const placeId = await seedPublishedPlace('Wat Pho', 'Thailand');

    const result = await savePlace(alice, ALICE, placeId);
    expect(result?.saved).toBe(true);

    // /you/saved's own unfiltered call.
    const wholeLibrary = await getSavedPlaces(alice, ALICE);
    expect(wholeLibrary.map((p) => p.placeId)).toContain(placeId);

    // The exact call components/travel/ItineraryEditor.tsx's picker now makes
    // when the "Saved" filter is selected — scoped to the trip's destination.
    const scoped = await getSavedPlaces(alice, ALICE, { destination: 'Thailand' });
    expect(scoped.map((p) => p.placeId)).toContain(placeId);

    // Never visible under an unrelated destination.
    const wrongDestination = await getSavedPlaces(alice, ALICE, { destination: 'Vietnam' });
    expect(wrongDestination.map((p) => p.placeId)).not.toContain(placeId);
  });

  it("Bob's heart never appears in Alice's library — RLS, not application filtering", async () => {
    const BOB = '22222222-2222-4222-8222-222222222222';
    await harness.createUser(BOB);
    const bob = harness.clientFor(BOB);
    const alice = harness.clientFor(ALICE);
    const placeId = await seedPublishedPlace('Wat Pho', 'Thailand');

    await savePlace(bob, BOB, placeId);

    expect(await getSavedPlaces(alice, ALICE)).toHaveLength(0);
  });
});

describe('M: adding a saved place to a trip does not touch saved_places', () => {
  it('addPlaceToTrip files the place into Ideas and leaves the library exactly as it was', async () => {
    const alice = harness.clientFor(ALICE);
    const placeId = await seedPublishedPlace('Wat Pho', 'Thailand');

    await savePlace(alice, ALICE, placeId);
    const beforeLibrary = await harness.rows('saved_places');
    expect(beforeLibrary).toHaveLength(1);

    const result = await addPlaceToTrip(alice, ALICE, placeId);
    expect(result.status).toBe('added');

    // The library is untouched — same row count, same row.
    const afterLibrary = await harness.rows('saved_places');
    expect(afterLibrary).toHaveLength(1);
    expect(afterLibrary[0].id).toBe(beforeLibrary[0].id);

    // But the place IS now on the trip.
    expect(await harness.rows('itinerary_places')).toHaveLength(1);
  });

  it('adding to a trip WITHOUT ever hearting never creates a saved_places row either', async () => {
    const alice = harness.clientFor(ALICE);
    const placeId = await seedPublishedPlace('Wat Pho', 'Thailand');

    await addPlaceToTrip(alice, ALICE, placeId);

    expect(await harness.rows('saved_places')).toHaveLength(0);
  });
});
