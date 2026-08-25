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
      expect.objectContaining({ name: 'Wat Pho', countryName: 'Thailand' })
    );
  });
});

describe('deduplication through the real save path', () => {
  it('the same traveler importing the same real place twice resolves to one canonical row', async () => {
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(alice, ALICE, [WAT_PHO], { destination: 'Thailand' });
    // A different literal spelling: migration 009's destination_places_owner_
    // name_idx forbids one owner writing the exact same (destination, name)
    // twice, so "the same place, spelled differently" — the realistic case a
    // second link about one place actually produces — is what is exercised
    // here. forceNew also puts it on a second trip, so the trip-level
    // "already have this name" skip (a separate, pre-existing mechanism) does
    // not short-circuit the save before the registry ever sees it.
    await importPlacesToTrip(alice, ALICE, [{ ...WAT_PHO, name: 'WAT PHO!!' }], {
      destination: 'Thailand',
      forceNew: true,
    });

    const places = await harness.rows('places');
    expect(places).toHaveLength(1);

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(2);
    expect(destRows[0].canonical_place_id).toBe(destRows[1].canonical_place_id);
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
