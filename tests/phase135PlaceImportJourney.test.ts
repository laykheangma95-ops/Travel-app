// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 — the save/import journey, against a REAL Postgres with the REAL
// policies. Same harness tests/placeImport.registry.test.ts and
// tests/resolvePlaceForTraveler.ambiguity.test.ts already use.
//
// Covers the investigation's exact reported shape (D), the invariant that
// canonical ambiguity must never block a trip save (E — Phase 13's own
// invariant, re-asserted here as a regression), the destination_places name
// collision healed forward rather than blocking (F), the same collision NEVER
// silently merging two different real places (G), and the pure zero/partial
// success decision helper the "saved" screen now renders from (I, J).
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { importPlacesToTrip, type ImportablePlace } from '@/lib/travel/placeImport';
import { importOutcomeStatus, type ImportOutcome } from '@/lib/travel/importOutcome';
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

describe('D: the exact reported candidate shape saves', () => {
  it('name "lẩu 2", an address-like description, real coordinates, into an existing Ho Chi Minh City trip', async () => {
    const alice = harness.clientFor(ALICE);

    // "an existing Ho Chi Minh City trip" — created ahead of the import, the
    // way the traveler's report describes it, not auto-created by the import.
    const { data: trip } = await alice
      .from('trip_plans')
      .insert({ user_id: ALICE, title: 'Saigon trip', destination: 'Vietnam' })
      .select('id')
      .single();

    const candidate: ImportablePlace = {
      name: 'lẩu 2',
      description: '190 Đề Thám, phường Cầu Ông Lãnh, quận 1, TpHCM',
      category: 'food',
      lat: 10.7657,
      lng: 106.6933,
      pinSource: 'caption',
      geocodeResultCount: 1,
      geocodeCountryMismatch: false,
    };

    const result = await importPlacesToTrip(alice, ALICE, [candidate], {
      destination: 'Vietnam',
      tripId: (trip as { id: string }).id,
    });

    expect(result.added).toEqual(['lẩu 2']);
    expect(result.failed).toEqual([]);
    expect(result.failedPlaces).toEqual([]);

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0].name).toBe('lẩu 2');

    const ideaRows = await harness.rows('itinerary_places');
    expect(ideaRows).toHaveLength(1);
  });
});

describe('E: canonical ambiguity/pending must never block the trip save — Phase 13 invariant, re-asserted', () => {
  it('an ambiguous proposal leaves canonical_place_id NULL, but the destination place and the Ideas row are both written', async () => {
    const service = harness.serviceClient();
    // Two branches of one cafe close enough together to be genuinely
    // ambiguous — same setup tests/resolvePlaceForTraveler.ambiguity.test.ts
    // uses to prove the resolver asks rather than guessing.
    const insert = (slug: string, lat: number, lng: number) =>
      service
        .from('places')
        .insert({ slug, name: 'Blue Cafe', country_name: 'Thailand', latitude: lat, longitude: lng, verification_status: 'domner_public' })
        .select('id')
        .single();
    await insert('blue-cafe-a', 13.7465, 100.4927);
    await insert('blue-cafe-b', 13.7474, 100.4927);

    const alice = harness.clientFor(ALICE);
    const candidate: ImportablePlace = {
      name: 'Blue Cafe',
      description: '',
      category: 'food',
      lat: 13.7465,
      lng: 100.4927,
      pinSource: 'maps-link',
      geocodeResultCount: null,
      geocodeCountryMismatch: null,
    };

    const result = await importPlacesToTrip(alice, ALICE, [candidate], { destination: 'Thailand' });

    // The invariant: saved to the trip regardless of canonical ambiguity.
    expect(result.added).toEqual(['Blue Cafe']);
    expect(result.failed).toEqual([]);
    expect(result.addedPlaces[0]?.canonicalPlaceId).toBeNull();
    expect(result.addedPlaces[0]?.resolution?.decision).toBe('ambiguous');

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0].canonical_place_id).toBeNull();

    const ideaRows = await harness.rows('itinerary_places');
    expect(ideaRows).toHaveLength(1);

    const feedback = await harness.rows('place_resolution_feedback');
    expect(feedback).toHaveLength(1);
    expect(feedback[0].decision).toBe('pending');
  });
});

describe('F: destination_places name collision — safe reuse when the existing row has no established identity', () => {
  it('a second import under the same name, same traveler, same destination reuses the orphaned row rather than failing', async () => {
    const alice = harness.clientFor(ALICE);

    // First import: no coordinates, so it never resolves — this is exactly
    // the orphan shape Phase 13.5's investigation found (also what a save
    // that failed after the destination_places insert, but before
    // addIdeaToTrip, would leave behind).
    const first = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'My Hotel', description: '', category: 'stay', lat: null, lng: null }],
      { destination: 'Vietnam' }
    );
    expect(first.added).toEqual(['My Hotel']);

    const afterFirst = await harness.rows('destination_places');
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].canonical_place_id).toBeNull();

    // Second import, same exact name — would hit
    // destination_places_owner_name_idx head-on. Healed forward: reused, not
    // rejected, and the traveler's save succeeds instead of permanently
    // blocking on this name for this destination.
    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'My Hotel', description: 'front desk note', category: 'stay', lat: 21.0285, lng: 105.8542 }],
      { destination: 'Vietnam', forceNew: true }
    );

    expect(second.failed).toEqual([]);

    // Still one destination_places row — reused, not duplicated.
    const afterSecond = await harness.rows('destination_places');
    expect(afterSecond).toHaveLength(1);
  });
});

describe('G: destination_places name collision — never silently reused when the existing row already has an identity', () => {
  it('a same-name collision against an ALREADY-LINKED row is disambiguated into a new row, never merged', async () => {
    const alice = harness.clientFor(ALICE);

    // First import resolves to a real canonical place (auto-link — no
    // competing candidate nearby).
    const first = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Same Name Cafe', description: '', category: 'food', lat: 13.7465, lng: 100.4927 }],
      { destination: 'Thailand' }
    );
    expect(first.added).toEqual(['Same Name Cafe']);

    const afterFirst = await harness.rows('destination_places');
    expect(afterFirst).toHaveLength(1);
    const firstCanonicalId = afterFirst[0].canonical_place_id as string | null;
    expect(firstCanonicalId).not.toBeNull();

    // Second import: the EXACT same name, but a genuinely different real
    // place, far enough away that it cannot be the same canonical identity.
    // insertOrReuseDestinationPlace must not reuse row one's identity here —
    // it has an established canonical link already.
    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Same Name Cafe', description: '', category: 'food', lat: 18.7883, lng: 98.9853 }], // Chiang Mai, ~600km away
      { destination: 'Thailand', forceNew: true }
    );

    expect(second.failed).toEqual([]);

    const afterSecond = await harness.rows('destination_places');
    expect(afterSecond).toHaveLength(2);
    // Never the same row mutated to a new identity — two distinct rows, two
    // distinct names (the second disambiguated), and never the same
    // canonical id (a genuinely different real place).
    const names = new Set(afterSecond.map((row) => row.name));
    expect(names.size).toBe(2);
    const secondRow = afterSecond.find((row) => row.id !== afterFirst[0].id)!;
    expect(secondRow.canonical_place_id).not.toBe(firstCanonicalId);
  });
});

describe('I/J: the zero/partial/full-success decision the "saved" screen renders from', () => {
  const base: Omit<ImportOutcome, 'added' | 'failed' | 'failedPlaces' | 'addedPlaces'> = {
    tripId: 't', tripTitle: 'Trip', createdTrip: false, skipped: [], canonicalPlaceId: null,
  };

  it('I: zero added, at least one failed is a failure state, never success', () => {
    const outcome: ImportOutcome = {
      ...base,
      added: [],
      failed: ['lẩu 2'],
      failedPlaces: [{ name: 'lẩu 2', code: 'itinerary_conflict', message: "Couldn't add lẩu 2." }],
      addedPlaces: [],
    };
    expect(importOutcomeStatus(outcome)).toBe('failure');
  });

  it('J: some added, some failed is partial — successful rows are not discarded by the status decision', () => {
    const outcome: ImportOutcome = {
      ...base,
      added: ['Wat Pho', 'Blue Cafe'],
      failed: ['My Hotel'],
      failedPlaces: [{ name: 'My Hotel', code: 'write_failed', message: "Couldn't add My Hotel." }],
      addedPlaces: [
        { name: 'Wat Pho', destinationPlaceId: 'd1', canonicalPlaceId: 'p1' },
        { name: 'Blue Cafe', destinationPlaceId: 'd2', canonicalPlaceId: null },
      ],
    };
    expect(importOutcomeStatus(outcome)).toBe('partial');
    expect(outcome.addedPlaces).toHaveLength(2);
  });

  it('all added, nothing failed is success; an all-skipped batch (nothing new) is also success', () => {
    const success: ImportOutcome = { ...base, added: ['Wat Pho'], failed: [], failedPlaces: [], addedPlaces: [{ name: 'Wat Pho', destinationPlaceId: 'd1', canonicalPlaceId: null }] };
    expect(importOutcomeStatus(success)).toBe('success');

    const allSkipped: ImportOutcome = { ...base, added: [], skipped: ['Wat Pho'], failed: [], failedPlaces: [], addedPlaces: [] };
    expect(importOutcomeStatus(allSkipped)).toBe('success');
  });
});
