// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — the importer wired to the canonical registry, against a REAL
// Postgres with the REAL policies.
//
// lib/places/repository.ts (resolvePlaceForTraveler, attachCanonicalPlace) was
// already built and already proven in isolation by
// tests/places.registry.rls.test.ts. Nothing here re-proves the repository —
// it proves the WIRING: that importPlacesToTrip (lib/travel/placeImport.ts)
// actually calls it, on the caller's own session client, with the guarantees
// the import pipeline depends on:
//
//   1. A real-world place resolves to one canonical row, reachable the same
//      way a traveler actually reaches it — through a save, not a direct
//      repository call.
//   2. A place with no coordinates is never sent into proximity matching —
//      (0, 0) is a "no map pin" placeholder, not a location, and merging on
//      it would collapse every coordinate-less import in the system onto one
//      row at null island.
//   3. The import path can never produce anything but `unverified`.
//   4. A registry failure costs a link, never a save.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importPlacesToTrip, type ImportablePlace } from '@/lib/travel/placeImport';
import * as registry from '@/lib/places/repository';
import { createHarness, type Harness } from './support/pgHarness';

vi.mock('@/lib/places/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/places/repository')>();
  return { ...actual, resolvePlaceForTraveler: vi.fn(actual.resolvePlaceForTraveler) };
});

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

/** Wat Pho, with real coordinates. */
const WAT_PHO: ImportablePlace = {
  name: 'Wat Pho',
  description: 'Reclining Buddha temple.',
  category: 'spot',
  lat: 13.7465,
  lng: 100.4927,
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  vi.mocked(registry.resolvePlaceForTraveler).mockClear();
});

afterAll(async () => {
  await harness.close();
});

describe('a place with real coordinates gets linked', () => {
  it('attaches canonical_place_id, and the canonical row starts unverified', async () => {
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    expect(result.added).toEqual(['Wat Pho']);

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0].canonical_place_id).not.toBeNull();

    const places = await harness.rows('places');
    expect(places).toHaveLength(1);
    expect(places[0].verification_status).toBe('unverified');
  });

  it('resolves through the caller\'s own session client, never a service/admin client', async () => {
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });

    expect(registry.resolvePlaceForTraveler).toHaveBeenCalledWith(
      alice,
      ALICE,
      expect.objectContaining({ name: 'Wat Pho', countryName: 'Thailand' }),
      expect.objectContaining({ pinOrigin: 'unknown' })
    );
  });
});

describe('deduplication through the real save path', () => {
  it('the same traveler importing the same real place twice, spelled differently, converges onto ONE destination_places row', async () => {
    // Phase 13.5 remediation (HIGH-1 review): canonical resolution now runs
    // BEFORE the traveler's own destination_places row is created, so a
    // second import that resolves to the SAME canonical place reuses the
    // traveler's existing row for it (lib/places/addToTrip.ts's own
    // findMaterializedRow, case A: "existing row's canonical id === incoming
    // canonical id → safe reuse") REGARDLESS of the raw spelling — it is
    // never blocked by `destination_places_owner_name_idx`, because it never
    // even attempts a second insert once the canonical match is known.
    //
    // Before this remediation, resolution ran AFTER insert, so a different
    // spelling always got its own row first and was only linked to the same
    // canonical place afterward — two rows, one canonical id. That was a
    // side effect of the old ordering, not a deliberate design requirement;
    // one row per real place per traveler is the better outcome, and it is
    // what the new ordering naturally produces.
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    // forceNew puts it on a second trip, so the trip-level "already have this
    // name" skip (a separate, pre-existing mechanism) does not short-circuit
    // the save before the registry ever sees it.
    const second = await importPlacesToTrip(alice, ALICE, [{ ...WAT_PHO, name: 'WAT PHO!!' }], {
      destination: 'Thailand',
      forceNew: true,
    });
    expect(second.failed).toEqual([]);

    const places = await harness.rows('places');
    expect(places).toHaveLength(1);

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0].canonical_place_id).toBe(places[0].id);
    // The traveler's ORIGINAL row and spelling — never overwritten by the
    // second attempt's differently-spelled name.
    expect(destRows[0].name).toBe('Wat Pho');
  });

  it('a hundred travelers land on one row, once it is published', async () => {
    // Cross-user proximity matching only sees PUBLISHED places (documented,
    // intentional limitation — SOCIAL-SAVE.md Part 9). Bob cannot see Alice's
    // still-unverified guess, so this proves the "100 users, 1 place" property
    // the way it actually holds today: after publication, not before.
    const alice = harness.clientFor(ALICE);
    const bob = harness.clientFor(BOB);
    const service = harness.serviceClient();

    await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    const [created] = await harness.rows('places');
    const placeId = created.id as string;

    await registry.linkProviderPlace(service, placeId, 'sandbox', 'wat-pho-id');
    await registry.promotePlace(service, placeId, 'provider_verified', {
      actor: 'provider:sandbox',
      reason: 'test',
    });
    await registry.promotePlace(service, placeId, 'domner_public', {
      actor: 'staff:owner@domner.test',
      reason: 'test',
    });

    await importPlacesToTrip(
      bob,
      BOB,
      [{ ...WAT_PHO, name: 'wat  pho!', lat: WAT_PHO.lat! + 0.0003, lng: WAT_PHO.lng! + 0.0002 }],
      { destination: 'Thailand' }
    );

    expect(await harness.rows('places')).toHaveLength(1);
    const destRows = await harness.rows('destination_places');
    expect(destRows.map((row) => row.canonical_place_id)).toEqual([placeId, placeId]);
  });

  it('the same real place imported by a second traveler BEFORE publication: one canonical row, one unlinked import — not two rows', async () => {
    // The actual, verified behavior for the common case (neither traveler has
    // published anything): places_identity_idx (no owner column at all) is
    // what stops a second canonical row from ever being created here — RLS is
    // what then stops Bob's own recovery lookup from finding Alice's row. The
    // combination is not "two unlinked duplicates"; it is one canonical row
    // plus one traveler whose save correctly stays unlinked. No mocking here:
    // this goes through the real resolvePlaceForTraveler, twice.
    const alice = harness.clientFor(ALICE);
    const bob = harness.clientFor(BOB);

    const aliceResult = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    const bobResult = await importPlacesToTrip(bob, BOB, [WAT_PHO], { destination: 'Thailand' });

    const places = await harness.rows('places');
    expect(places).toHaveLength(1);
    expect(places[0].verification_status).toBe('unverified');

    const destRows = await harness.rows('destination_places');
    const aliceRow = destRows.find((row) => row.created_by === ALICE);
    const bobRow = destRows.find((row) => row.created_by === BOB);

    expect(aliceRow?.canonical_place_id).toBe(places[0].id);
    expect(bobRow?.canonical_place_id).toBeNull();

    // Bob's save still succeeds — a registry miss is never a save failure.
    expect(aliceResult.added).toEqual(['Wat Pho']);
    expect(bobResult.added).toEqual(['Wat Pho']);
    expect(bobResult.failed).toEqual([]);
  });

  it('does not merge two different places that happen to share a normalized name', async () => {
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    // Same normalized name as WAT_PHO ("watpho"), but a literally different
    // destination_places.name (so migration 009's per-owner unique index does
    // not itself refuse the second row) and ~150km away — nowhere near the
    // 150m radius that decides "same place". Proves distance disqualifies a
    // name match rather than the registry merging on name alone.
    await importPlacesToTrip(
      alice,
      ALICE,
      [{ ...WAT_PHO, name: 'wat  pho!', lat: WAT_PHO.lat! + 1.4, lng: WAT_PHO.lng! + 1.2 }],
      { destination: 'Thailand', forceNew: true }
    );

    expect(await harness.rows('places')).toHaveLength(2);
  });
});

describe('the null-island guard', () => {
  it('leaves canonical_place_id NULL for a place with no coordinates', async () => {
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(alice, ALICE, [{ ...WAT_PHO, lat: null, lng: null }], {
      destination: 'Thailand',
    });

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    // The `?? 0` fallback still applies to the STORED row (no map pin) — the
    // guard is about what is sent into resolution, not what destination_places
    // ends up holding.
    expect(destRows[0].lat).toBe(0);
    expect(destRows[0].lng).toBe(0);
    expect(destRows[0].canonical_place_id).toBeNull();

    expect(registry.resolvePlaceForTraveler).not.toHaveBeenCalled();
    expect(await harness.rows('places')).toHaveLength(0);
  });

  it('never merges two coordinate-less imports through the (0, 0) sentinel', async () => {
    const alice = harness.clientFor(ALICE);
    const bob = harness.clientFor(BOB);

    await importPlacesToTrip(alice, ALICE, [{ ...WAT_PHO, lat: null, lng: null }], {
      destination: 'Thailand',
    });
    await importPlacesToTrip(bob, BOB, [{ ...WAT_PHO, lat: null, lng: null }], {
      destination: 'Thailand',
    });

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(2);
    expect(destRows.every((row) => row.canonical_place_id === null)).toBe(true);
    // Nothing was ever created in the registry — not one row, let alone one
    // shared by two unrelated travelers' guesses.
    expect(await harness.rows('places')).toHaveLength(0);
  });
});

describe('the verification ceiling holds through the import path', () => {
  it('every place the importer creates is unverified, and cannot be escalated by the traveler', async () => {
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    const [created] = await harness.rows('places');
    expect(created.verification_status).toBe('unverified');

    const { data, error } = await alice
      .from('places')
      .update({ verification_status: 'domner_public' })
      .eq('id', created.id as string)
      .select('id');

    // RLS's WITH CHECK on the traveler's own unverified-row policy refuses
    // this — either as an explicit error or as a write matching zero rows.
    // Same guarantee tests/places.registry.rls.test.ts proves against the
    // repository directly; this proves it holds from the import call path.
    expect(error !== null || (data ?? []).length === 0).toBe(true);

    const after = await harness.rows('places');
    expect(after[0].verification_status).toBe('unverified');
  });
});

describe('Phase 9 — the canonical id surfaced for a "View place" link', () => {
  it('is the resolved canonical id when exactly one place is added', async () => {
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });

    const [place] = await harness.rows('places');
    expect(result.canonicalPlaceId).toBe(place.id);
  });

  it('is null when the single added place never resolved (no coordinates)', async () => {
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(alice, ALICE, [{ ...WAT_PHO, lat: null, lng: null }], {
      destination: 'Thailand',
    });

    expect(result.added).toEqual(['Wat Pho']);
    expect(result.canonicalPlaceId).toBeNull();
  });

  it('is null for a multi-place import, even though every place resolved', async () => {
    const alice = harness.clientFor(ALICE);
    const watArun: ImportablePlace = {
      name: 'Wat Arun',
      description: 'Temple of Dawn.',
      category: 'spot',
      lat: WAT_PHO.lat! + 0.02,
      lng: WAT_PHO.lng! + 0.02,
    };

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO, watArun], { destination: 'Thailand' });

    expect(result.added).toHaveLength(2);
    expect(await harness.rows('places')).toHaveLength(2);
    // There is no single place left for a "View place" link to point at.
    expect(result.canonicalPlaceId).toBeNull();
  });

  it('is null when the registry link failed (mocked)', async () => {
    vi.mocked(registry.resolvePlaceForTraveler).mockRejectedValueOnce(new Error('boom'));
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });

    expect(result.added).toEqual(['Wat Pho']);
    expect(result.canonicalPlaceId).toBeNull();
  });
});

// Phase 12 — per-place results. Each entry in `addedPlaces` must point at the
// place it actually came from, never at another place in the same batch, and
// `addedPlaces` must contain exactly the places that were actually written —
// not one entry per input place.
describe('addedPlaces — per-place result correctness', () => {
  it('gives each of two resolved places its own, correct canonical id', async () => {
    const alice = harness.clientFor(ALICE);
    const watArun: ImportablePlace = {
      name: 'Wat Arun',
      description: 'Temple of Dawn.',
      category: 'spot',
      lat: WAT_PHO.lat! + 0.5,
      lng: WAT_PHO.lng! + 0.5,
    };

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO, watArun], { destination: 'Thailand' });

    expect(result.addedPlaces).toHaveLength(2);
    // Backward compatible: `added` is still every name, in order, derived
    // from the same array `addedPlaces` is.
    expect(result.added).toEqual(['Wat Pho', 'Wat Arun']);

    const places = (await harness.rows('places')) as { id: string; name: string }[];
    const watPhoRow = places.find((row) => row.name === 'Wat Pho');
    const watArunRow = places.find((row) => row.name === 'Wat Arun');

    const watPhoEntry = result.addedPlaces.find((entry) => entry.name === 'Wat Pho');
    const watArunEntry = result.addedPlaces.find((entry) => entry.name === 'Wat Arun');

    expect(watPhoEntry?.canonicalPlaceId).toBe(watPhoRow?.id);
    expect(watArunEntry?.canonicalPlaceId).toBe(watArunRow?.id);
    // The one thing a swapped pair of parallel arrays would fail to catch:
    // two different places must not end up pointing at the same, or each
    // other's, canonical row.
    expect(watPhoEntry?.canonicalPlaceId).not.toBe(watArunEntry?.canonicalPlaceId);
  });

  it('gives a coordinate-less place a null canonical id without failing the import', async () => {
    const alice = harness.clientFor(ALICE);
    const watArun: ImportablePlace = {
      name: 'Wat Arun',
      description: 'Temple of Dawn.',
      category: 'spot',
      lat: null,
      lng: null,
    };

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO, watArun], { destination: 'Thailand' });

    expect(result.addedPlaces).toHaveLength(2);
    expect(result.addedPlaces.find((entry) => entry.name === 'Wat Pho')?.canonicalPlaceId).not.toBeNull();
    expect(result.addedPlaces.find((entry) => entry.name === 'Wat Arun')?.canonicalPlaceId).toBeNull();
  });

  it('excludes a skipped place — same name, same trip, imported twice', async () => {
    const alice = harness.clientFor(ALICE);
    const first = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });

    const second = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { tripId: first.tripId, destination: 'Thailand' });

    expect(second.skipped).toEqual(['Wat Pho']);
    expect(second.addedPlaces).toEqual([]);
    expect(second.added).toEqual([]);
  });
});

// Phase 12 kept the trip-save and the library-save deliberately apart (manual
// heart, no auto-save — see docs/SOCIAL-SAVE.md Part 15). This is the
// half of that separation importPlacesToTrip itself is responsible for:
// importing must never, on its own, put anything in the library.
describe('import alone never touches the library', () => {
  it('writes no saved_places row for a resolved, canonically-linked place', async () => {
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });

    expect(result.addedPlaces[0]?.canonicalPlaceId).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });
});

describe('failure isolation', () => {
  it('a registry failure does not fail the place save, the import, or trip creation', async () => {
    vi.mocked(registry.resolvePlaceForTraveler).mockRejectedValueOnce(new Error('boom'));
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });

    expect(result.added).toEqual(['Wat Pho']);
    expect(result.failed).toEqual([]);
    expect(result.createdTrip).toBe(true);

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0].canonical_place_id).toBeNull();
    // The failed attempt must not have left a half-written registry row either.
    expect(await harness.rows('places')).toHaveLength(0);
  });
});
