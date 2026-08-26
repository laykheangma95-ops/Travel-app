// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: resolvePlaceForTraveler no longer takes nearby[0] unconditionally.
// This is the regression test for the exact failure §D of the Phase 13
// readiness report named — "two same-name places inside 150m" — proving the
// resolver now asks rather than silently picking one, against a REAL Postgres
// with the REAL policies (same harness tests/places.registry.rls.test.ts
// already uses).
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_LINK_CONFIDENCE } from '@/lib/places/resolutionConfidence';
import { proposeCanonicalResolution, resolvePlaceForTraveler } from '@/lib/places/repository';
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

/** Two branches of one café, ~100m apart — both published so a traveler can
 *  see both under RLS. */
async function seedTwoBranches(harnessInstance: Harness) {
  const service = harnessInstance.serviceClient();
  const insert = (slug: string, lat: number, lng: number) =>
    service
      .from('places')
      .insert({
        slug,
        name: 'Blue Cafe',
        country_name: 'Thailand',
        latitude: lat,
        longitude: lng,
        verification_status: 'domner_public',
      })
      .select('id')
      .single();

  const a = await insert('blue-cafe-a', 13.7465, 100.4927);
  const b = await insert('blue-cafe-b', 13.7474, 100.4927); // ~100m north
  return { a: (a.data as { id: string }).id, b: (b.data as { id: string }).id };
}

describe('two same-name places inside 150m produce ambiguity, not an arbitrary pick', () => {
  it('resolvePlaceForTraveler returns decision "ambiguous" with the other branch as an alternative', async () => {
    const { a, b } = await seedTwoBranches(harness);
    const alice = harness.clientFor(ALICE);

    const resolution = await resolvePlaceForTraveler(alice, ALICE, {
      name: 'Blue Cafe',
      countryName: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927, // exactly on branch A
    });

    expect(resolution?.decision).toBe('ambiguous');
    expect(resolution?.confidence).toBeLessThan(AUTO_LINK_CONFIDENCE);
    expect(resolution?.place.id).toBe(a);
    expect(resolution?.alternatives).toHaveLength(1);
    expect(resolution?.alternatives[0]?.place.id).toBe(b);

    // No third row was created — 'ambiguous' still means "these two are the
    // candidates", not "start a fresh place because nothing is certain".
    expect(await harness.rows('places')).toHaveLength(2);
  });

  it('a single matching branch (no other candidate in range) still auto-links', async () => {
    const service = harness.serviceClient();
    const { data } = await service
      .from('places')
      .insert({
        slug: 'lone-cafe',
        name: 'Lone Cafe',
        country_name: 'Thailand',
        latitude: 13.7465,
        longitude: 100.4927,
        verification_status: 'domner_public',
      })
      .select('id')
      .single();
    const placeId = (data as { id: string }).id;

    const alice = harness.clientFor(ALICE);
    const resolution = await resolvePlaceForTraveler(alice, ALICE, {
      name: 'Lone Cafe',
      countryName: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
    });

    expect(resolution?.decision).toBe('auto');
    expect(resolution?.place.id).toBe(placeId);
    expect(resolution?.alternatives).toHaveLength(0);
  });

  it('proposeCanonicalResolution (no write) agrees with resolvePlaceForTraveler on the same input', async () => {
    const { a, b } = await seedTwoBranches(harness);
    const alice = harness.clientFor(ALICE);

    const proposal = await proposeCanonicalResolution(
      alice,
      { name: 'Blue Cafe', countryName: 'Thailand', city: null, latitude: 13.7465, longitude: 100.4927 },
      { pinOrigin: 'unknown', geocoderResultCount: null }
    );

    expect(proposal?.decision).toBe('ambiguous');
    expect(proposal?.place.id).toBe(a);
    expect(proposal?.alternatives[0]?.place.id).toBe(b);
    // Confirms this is genuinely read-only: no row was ever inserted by it.
    expect(await harness.rows('places')).toHaveLength(2);
  });

  it('a country disagreement can push an otherwise-close single match to ambiguous', async () => {
    const service = harness.serviceClient();
    await service
      .from('places')
      .insert({
        slug: 'cross-border-cafe',
        name: 'Border Cafe',
        country_name: 'Vietnam',
        latitude: 13.7465,
        longitude: 100.4927,
        verification_status: 'domner_public',
      })
      .select('id')
      .single();

    const alice = harness.clientFor(ALICE);
    // 60m away — proximityConfidence alone would clear AUTO_LINK_CONFIDENCE,
    // but the country disagreement (Thailand vs the row's Vietnam) knocks it
    // below the auto threshold.
    const resolution = await resolvePlaceForTraveler(alice, ALICE, {
      name: 'Border Cafe',
      countryName: 'Thailand',
      latitude: 13.747,
      longitude: 100.4927,
    });

    expect(resolution?.reasonSignals.countryMatch).toBe(false);
    expect(resolution?.decision).not.toBe('auto');
  });

  it('an ambiguous decision never attaches a canonical id through the import save path', async () => {
    const { importPlacesToTrip } = await import('@/lib/travel/placeImport');
    await seedTwoBranches(harness);
    const alice = harness.clientFor(ALICE);

    const result = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Blue Cafe', description: '', category: 'food', lat: 13.7465, lng: 100.4927 }],
      { destination: 'Thailand' }
    );

    expect(result.added).toEqual(['Blue Cafe']);
    expect(result.canonicalPlaceId).toBeNull();
    expect(result.addedPlaces[0]?.canonicalPlaceId).toBeNull();
    expect(result.addedPlaces[0]?.resolution?.decision).toBe('ambiguous');
    expect(result.addedPlaces[0]?.resolution?.alternatives).toHaveLength(1);

    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0]?.canonical_place_id).toBeNull();
    // Still no third canonical row — the failure this closes is a WRONG
    // silent link, not a missing one, and "ambiguous" must not fabricate a
    // fresh place either.
    expect(await harness.rows('places')).toHaveLength(2);
  });
});
