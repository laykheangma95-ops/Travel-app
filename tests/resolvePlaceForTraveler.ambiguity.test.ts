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
      { name: 'Blue Cafe', countryName: 'Thailand', latitude: 13.7465, longitude: 100.4927 },
      { pinOrigin: 'unknown', geocoderResultCount: null, geocoderCountryMismatch: null }
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

describe('every resolution-v1 signal is reachable from the real import path', () => {
  // The Phase 13 review found two scoring factors that only a unit-test
  // fixture could produce (a city penalty nothing supplied, and a geocoder
  // country verdict computed then discarded). One was removed; the other is
  // wired, and this is what proves it — end to end through importPlacesToTrip,
  // not by calling scoreResolution directly.
  it('the geocoder\'s country verdict reaches the score and is recorded', async () => {
    const service = harness.serviceClient();
    // Two identically-placed canonical rows with DIFFERENT names: migration
    // 009's unique (created_by, destination, name) index forbids one traveler
    // importing the same name twice, so the A/B pair has to differ by name.
    for (const name of ['Border Cafe One', 'Border Cafe Two']) {
      await service.from('places').insert({
        slug: `border-${name.toLowerCase().replace(/ /g, '-')}`,
        name,
        country_name: 'Thailand',
        latitude: 13.7465,
        longitude: 100.4927,
        verification_status: 'domner_public',
      });
    }

    const { importPlacesToTrip } = await import('@/lib/travel/placeImport');
    const alice = harness.clientFor(ALICE);

    // Same distance, same pin origin, same everything — except that in the
    // second case the geocoder reported every candidate it returned was in the
    // wrong country. Any difference in score is that one signal.
    const agreeing = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Border Cafe One', description: '', category: 'food', lat: 13.74665, lng: 100.4927,
         pinSource: 'caption', geocodeResultCount: 1, geocodeCountryMismatch: false }],
      { destination: 'Thailand' }
    );

    const disagreeing = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Border Cafe Two', description: '', category: 'food', lat: 13.74665, lng: 100.4927,
         pinSource: 'caption', geocodeResultCount: 1, geocodeCountryMismatch: true }],
      { destination: 'Thailand' }
    );

    const withAgreement = agreeing.addedPlaces[0].resolution;
    const withMismatch = disagreeing.addedPlaces[0].resolution;
    expect(withAgreement?.decision).toBe('ambiguous');
    expect(withMismatch?.decision).toBe('ambiguous');

    // The penalty actually applied.
    expect(withMismatch!.confidence).toBeLessThan(withAgreement!.confidence);

    // And it is on the record, computed by the database rather than asserted
    // by the client.
    const rows = await harness.rows('place_resolution_feedback');
    const signals = rows.map((r) => (r.reason_signals as Record<string, unknown>).countryMatch);
    expect(signals).toContain(false);
  });

  it('the geocoder pin origin reaches the score from the real import path', async () => {
    const service = harness.serviceClient();
    for (const name of ['Pin Cafe One', 'Pin Cafe Two']) {
      await service.from('places').insert({
        slug: `pin-${name.toLowerCase().replace(/ /g, '-')}`,
        name,
        country_name: 'Thailand',
        latitude: 13.7465,
        longitude: 100.4927,
        verification_status: 'domner_public',
      });
    }

    const { importPlacesToTrip } = await import('@/lib/travel/placeImport');
    const alice = harness.clientFor(ALICE);

    // A maps-link pin at this distance auto-links; a geocoded one at the SAME
    // distance does not. That difference is the x0.8 factor, and it is the
    // exact pair BLOCKER-1 turned into a dead button.
    const exact = await importPlacesToTrip(
      alice, ALICE,
      [{ name: 'Pin Cafe One', description: '', category: 'food', lat: 13.74659, lng: 100.4927,
         pinSource: 'maps-link' }],
      { destination: 'Thailand' }
    );
    const geocoded = await importPlacesToTrip(
      alice, ALICE,
      [{ name: 'Pin Cafe Two', description: '', category: 'food', lat: 13.74659, lng: 100.4927,
         pinSource: 'caption' }],
      { destination: 'Thailand' }
    );

    expect(exact.addedPlaces[0].canonicalPlaceId).not.toBeNull();
    expect(exact.addedPlaces[0].resolution).toBeUndefined();

    expect(geocoded.addedPlaces[0].canonicalPlaceId).toBeNull();
    expect(geocoded.addedPlaces[0].resolution?.decision).toBe('ambiguous');
    const signals = (await harness.rows('place_resolution_feedback'))[0].reason_signals as Record<string, unknown>;
    expect(signals.pinOrigin).toBe('geocoder');
  });

  it('the alternative count in the record is the one the database measured', async () => {
    const { a, b } = await seedTwoBranches(harness);
    const { importPlacesToTrip } = await import('@/lib/travel/placeImport');

    const result = await importPlacesToTrip(
      harness.clientFor(ALICE),
      ALICE,
      [{ name: 'Blue Cafe', description: '', category: 'food', lat: 13.7465, lng: 100.4927,
         pinSource: 'caption' }],
      { destination: 'Thailand' }
    );

    expect(result.addedPlaces[0].resolution?.decision).toBe('ambiguous');
    const row = (await harness.rows('place_resolution_feedback'))[0];
    expect(row.proposed_place_id).toBe(a);
    expect(row.alternative_place_ids).toEqual([b]);
    expect((row.reason_signals as Record<string, unknown>).alternativeCount).toBe(1);
  });
});
