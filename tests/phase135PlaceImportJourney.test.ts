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

  it('the same shape, but the existing Ideas list has non-contiguous sort_order — the actual reported condition, re-verified after remediation', async () => {
    const alice = harness.clientFor(ALICE);
    const { data: trip } = await alice
      .from('trip_plans')
      .insert({ user_id: ALICE, title: 'Saigon trip', destination: 'Vietnam' })
      .select('id')
      .single();
    const tripId = (trip as { id: string }).id;

    const [{ id: dayId }] = await harness.asAdmin(
      `INSERT INTO itinerary_days (trip_id, day_index, date) VALUES ($1, 0, NULL) RETURNING id`,
      [tripId]
    );
    // A gap left by an earlier delete or move — sort_order {0, 2, 5}, exactly
    // the shape a real, already-organised trip ends up in.
    for (const [i, sortOrder] of [0, 2, 5].entries()) {
      const [{ id: placeId }] = await harness.asAdmin(
        `INSERT INTO destination_places (destination,name,category,lat,lng,description,source,created_by)
         VALUES ('Vietnam',$1,'spot',0,0,'','ai_generated',$2) RETURNING id`,
        [`Existing ${i}`, ALICE]
      );
      await harness.asAdmin(
        `INSERT INTO itinerary_places (itinerary_day_id,place_id,category,sort_order) VALUES ($1,$2,'spot',$3)`,
        [dayId, placeId, sortOrder]
      );
    }

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

    const result = await importPlacesToTrip(alice, ALICE, [candidate], { destination: 'Vietnam', tripId });

    expect(result.added).toEqual(['lẩu 2']);
    expect(result.failed).toEqual([]);

    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(4);
    const sortOrders = rows.map((row) => row.sort_order).sort((a, b) => (a as number) - (b as number));
    expect(new Set(sortOrders).size).toBe(4); // no collision on the gap at 2
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

describe('F/HIGH-1: destination_places name collision — NAME ALONE IS NEVER SUFFICIENT IDENTITY EVIDENCE', () => {
  // Phase 13.5's first cut healed a same-name collision by reusing any
  // unlinked row outright. The principal engineer review proved that reuse
  // silently merges two DIFFERENT real places that merely share a name — the
  // incoming coordinates and description were discarded, and the NEW
  // canonical identity got attached to the OLD row. This block is the
  // remediation's regression suite: the exact Starbucks reproduction from the
  // review, plus the convergence and non-convergence cases around it.

  it('existing row: NULL canonical, location A. Incoming: canonical B, location B, same name → NEVER merged, both preserved', async () => {
    const alice = harness.clientFor(ALICE);

    // Existing row: no coordinates, so it never resolves — canonical stays
    // NULL. This is the exact orphan shape Phase 13.5's investigation found.
    const first = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Starbucks', description: 'Old location', category: 'food', lat: null, lng: null }],
      { destination: 'Vietnam' }
    );
    expect(first.added).toEqual(['Starbucks']);

    const afterFirst = await harness.rows('destination_places');
    expect(afterFirst).toHaveLength(1);
    const oldRow = afterFirst[0];
    expect(oldRow.canonical_place_id).toBeNull();

    // Incoming: the exact same name, but a genuinely different real branch —
    // real coordinates, a registry miss (so it resolves to a FRESH canonical
    // place, decision 'auto', matchedBy 'created' — exactly the Tan Binh
    // branch the review reproduced against a live database).
    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Starbucks', description: 'New location', category: 'food', lat: 10.8006, lng: 106.6528 }],
      { destination: 'Vietnam', forceNew: true }
    );

    expect(second.failed).toEqual([]);
    expect(second.added).toEqual(['Starbucks']);

    const afterSecond = await harness.rows('destination_places');
    expect(afterSecond).toHaveLength(2);

    // The OLD row is byte-for-byte unchanged: same id, still NULL canonical,
    // still its own coordinates and description. This is the assertion the
    // unsafe version failed — it silently rewrote this exact row.
    const oldRowAfter = afterSecond.find((row) => row.id === oldRow.id)!;
    expect(oldRowAfter).toEqual(oldRow);
    expect(oldRowAfter.canonical_place_id).toBeNull();

    // The NEW row carries the NEW coordinates and description — never
    // discarded — under its own canonical identity.
    const newRow = afterSecond.find((row) => row.id !== oldRow.id)!;
    expect(newRow.description).toBe('New location');
    expect(Number(newRow.lat)).toBeCloseTo(10.8006, 4);
    expect(Number(newRow.lng)).toBeCloseTo(106.6528, 4);
    expect(newRow.canonical_place_id).not.toBeNull();
    expect(newRow.canonical_place_id).not.toBe(oldRow.canonical_place_id);
  });

  it('existing canonical A, incoming canonical B, same name → never reuse A', async () => {
    const alice = harness.clientFor(ALICE);

    const first = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Highlands Coffee', description: 'District 1', category: 'food', lat: 10.7657, lng: 106.6933 }],
      { destination: 'Vietnam' }
    );
    expect(first.added).toEqual(['Highlands Coffee']);
    const afterFirst = await harness.rows('destination_places');
    const canonicalA = afterFirst[0].canonical_place_id;
    expect(canonicalA).not.toBeNull();

    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Highlands Coffee', description: 'Tan Binh', category: 'food', lat: 10.8006, lng: 106.6528 }],
      { destination: 'Vietnam', forceNew: true }
    );
    expect(second.failed).toEqual([]);

    const afterSecond = await harness.rows('destination_places');
    expect(afterSecond).toHaveLength(2);
    const rowA = afterSecond.find((row) => row.canonical_place_id === canonicalA)!;
    const rowB = afterSecond.find((row) => row.canonical_place_id !== canonicalA)!;
    expect(rowA.description).toBe('District 1'); // untouched
    expect(rowB.description).toBe('Tan Binh');
    expect(rowB.canonical_place_id).not.toBeNull();
    expect(rowB.canonical_place_id).not.toBe(canonicalA);
  });

  it('existing canonical B, incoming canonical B, same name → reuse/converge safely (one row, not two)', async () => {
    const alice = harness.clientFor(ALICE);

    const first = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Phuc Long', description: 'first caption', category: 'food', lat: 10.7657, lng: 106.6933 }],
      { destination: 'Vietnam' }
    );
    expect(first.added).toEqual(['Phuc Long']);
    const afterFirst = await harness.rows('destination_places');
    expect(afterFirst).toHaveLength(1);
    const canonicalB = afterFirst[0].canonical_place_id;
    expect(canonicalB).not.toBeNull();

    // Same real place, re-imported (a different caption spelling would also
    // converge via the registry's own name-fold matching — this uses the
    // identical name to isolate the destination_places-level convergence
    // this block is about, from Phase 10's own proximity matching).
    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Phuc Long', description: 'second caption', category: 'food', lat: 10.7657, lng: 106.6933 }],
      { destination: 'Vietnam', forceNew: true }
    );
    expect(second.failed).toEqual([]);

    // ONE row — reused, not duplicated, and the traveler's original
    // description was not silently overwritten by the second attempt.
    const afterSecond = await harness.rows('destination_places');
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(afterFirst[0].id);
    expect(afterSecond[0].description).toBe('first caption');
  });

  it('deterministic convergence: the SAME canonical place imported 3 times results in ONE destination_places row, never three', async () => {
    const alice = harness.clientFor(ALICE);
    const coords = { lat: 10.7676, lng: 106.6903 };

    for (let i = 0; i < 3; i += 1) {
      const result = await importPlacesToTrip(
        alice,
        ALICE,
        [{ name: 'Banh Mi Huynh Hoa', description: `attempt ${i}`, category: 'food', ...coords }],
        { destination: 'Vietnam', forceNew: true }
      );
      expect(result.failed).toEqual([]);
    }

    const rows = await harness.rows('destination_places');
    expect(rows).toHaveLength(1);
    const canonicals = await harness.rows('places');
    expect(canonicals).toHaveLength(1);
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
