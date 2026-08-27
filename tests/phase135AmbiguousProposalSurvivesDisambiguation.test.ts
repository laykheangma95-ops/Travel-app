// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 MEDIUM-1 remediation — a pending proposal must survive a
// deterministic disambiguated destination-place name.
//
// The failure found in the final principal engineer review: HIGH-1's
// disambiguation embeds coordinates or a canonical-id slice in the row's raw
// `name` column so the write survives destination_places_owner_name_idx
// (migration 009). But migration 017's create_place_resolution_proposal
// requires place_name_normalized(destination_places.name) to still equal the
// proposed canonical place's name_normalized — a genuine anti-fabrication
// check, proving the row's own material actually looks like the candidate
// being proposed, not merely trusting the caller. A digit-bearing suffix
// breaks that equality, so `recordProposal` silently returned null: the
// trip save still succeeded (fails safe), but the confirmation card the
// traveler needed never had anywhere to land.
//
// The fix (lib/travel/placeImport.ts's `normalizationSafeDisambiguation`)
// is scoped to exactly the case that reaches this RPC — an 'ambiguous'
// decision — and uses a suffix of nothing but literal spaces:
// place_name_normalized (migration 013) strips space/tab/CR/LF, so the raw
// string is still unique (satisfying the DB constraint) while its
// normalized form is untouched (satisfying migration 017's check). Neither
// migration was edited.
//
// This file proves the full lifecycle against real Postgres: the trip save
// succeeds, the new row is separate from and does not disturb the existing
// collision, canonical_place_id stays NULL, a pending proposal exists with
// evidence DoneStage can render, and both outcomes of resolving it — confirm
// and reject — behave correctly afterward.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { importPlacesToTrip } from '@/lib/travel/placeImport';
import { applyResolutionFeedback } from '@/lib/places/resolutionFeedback';
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

/** Two branches of one cafe ~100m apart, both published — the same ambiguity
 *  shape tests/resolvePlaceForTraveler.ambiguity.test.ts and
 *  tests/phase135PlaceImportJourney.test.ts's own §E already use. */
async function seedAmbiguousPair() {
  const service = harness.serviceClient();
  const insert = (slug: string, lat: number) =>
    service
      .from('places')
      .insert({
        slug,
        name: 'Blue Cafe',
        country_name: 'Thailand',
        latitude: lat,
        longitude: 100.4927,
        verification_status: 'domner_public',
      })
      .select('id')
      .single();
  const a = await insert('blue-cafe-a', 13.7465);
  const b = await insert('blue-cafe-b', 13.7474);
  return { a: (a.data as { id: string }).id, b: (b.data as { id: string }).id };
}

describe('MEDIUM-1: pending proposal survives a disambiguated destination-place name', () => {
  it('a second ambiguous import colliding by name still gets its own pending proposal — full lifecycle', async () => {
    const { a, b } = await seedAmbiguousPair();
    const alice = harness.clientFor(ALICE);

    // First import: no name collision (nothing exists yet for this owner),
    // so it lands under the plain name, unmolested.
    const first = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Blue Cafe', description: 'first note', category: 'food', lat: 13.7465, lng: 100.4927, pinSource: 'maps-link' }],
      { destination: 'Thailand' }
    );
    expect(first.added).toEqual(['Blue Cafe']);
    expect(first.addedPlaces[0]?.resolution?.decision).toBe('ambiguous');

    const afterFirst = await harness.rows('destination_places');
    expect(afterFirst).toHaveLength(1);
    const existingRow = afterFirst[0];
    expect(existingRow.name).toBe('Blue Cafe');
    expect(existingRow.canonical_place_id).toBeNull();

    // Second import — the EXACT same raw name, forcing the disambiguation
    // path this fix targets. Also resolves ambiguously (same two branches).
    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Blue Cafe', description: 'second note', category: 'food', lat: 13.7465, lng: 100.4927, pinSource: 'maps-link' }],
      { destination: 'Thailand', forceNew: true }
    );

    // 1. Trip save succeeds — the Phase 13.5 invariant this fix must not cost.
    expect(second.added).toEqual(['Blue Cafe']);
    expect(second.failed).toEqual([]);

    // 2. New row is separate from, and does not disturb, the existing one.
    const afterSecond = await harness.rows('destination_places');
    expect(afterSecond).toHaveLength(2);
    const existingRowAfter = afterSecond.find((row) => row.id === existingRow.id)!;
    expect(existingRowAfter).toEqual(existingRow); // byte-for-byte untouched
    const newRow = afterSecond.find((row) => row.id !== existingRow.id)!;
    expect(newRow.description).toBe('second note');

    // The disambiguation is invisible-but-present: same visible text, a raw
    // string that differs only in trailing whitespace.
    expect((newRow.name as string).trim()).toBe('Blue Cafe');
    expect(newRow.name).not.toBe('Blue Cafe'); // the raw strings differ

    // 3. canonical_place_id remains NULL — Phase 13's own rule.
    expect(newRow.canonical_place_id).toBeNull();

    // 4. THE FIX: a pending proposal exists for the NEW row, not just the
    //    first one.
    const feedback = await harness.rows('place_resolution_feedback');
    expect(feedback).toHaveLength(2);
    const newFeedback = feedback.find((row) => row.destination_place_id === newRow.id);
    expect(newFeedback).toBeTruthy();
    expect(newFeedback!.decision).toBe('pending');

    // 5. The evidence DoneStage actually renders is present and correct.
    const resolution = second.addedPlaces[0]?.resolution;
    expect(resolution?.decision).toBe('ambiguous');
    expect([a, b]).toContain(resolution?.proposed.id);
    expect(resolution?.alternatives).toHaveLength(1);
    expect([a, b]).toContain(resolution?.alternatives[0]?.id);
    expect(resolution?.confidence).toBeGreaterThan(0);
    expect(resolution?.confidence).toBeLessThan(1);

    // 6. Confirming applies the proposed canonical place.
    const confirmed = await applyResolutionFeedback(alice, ALICE, {
      destinationPlaceId: newRow.id as string,
      decision: 'confirmed',
    });
    expect(confirmed.outcome).toBe('applied');
    if (confirmed.outcome !== 'applied') throw new Error('unreachable');
    expect(confirmed.canonicalPlaceId).toBe(resolution?.proposed.id);

    const rowAfterConfirm = await harness.asAdmin(`SELECT canonical_place_id FROM destination_places WHERE id = $1`, [
      newRow.id,
    ]);
    expect(rowAfterConfirm[0].canonical_place_id).toBe(resolution?.proposed.id);
  });

  it('rejecting leaves the row unlinked, and the existing colliding row is never touched', async () => {
    await seedAmbiguousPair();
    const alice = harness.clientFor(ALICE);

    await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Blue Cafe', description: 'first', category: 'food', lat: 13.7465, lng: 100.4927, pinSource: 'maps-link' }],
      { destination: 'Thailand' }
    );
    const existingRow = (await harness.rows('destination_places'))[0];

    const second = await importPlacesToTrip(
      alice,
      ALICE,
      [{ name: 'Blue Cafe', description: 'second', category: 'food', lat: 13.7465, lng: 100.4927, pinSource: 'maps-link' }],
      { destination: 'Thailand', forceNew: true }
    );
    const newRow = (await harness.rows('destination_places')).find((row) => row.id !== existingRow.id)!;

    const rejected = await applyResolutionFeedback(alice, ALICE, {
      destinationPlaceId: newRow.id as string,
      decision: 'rejected',
    });
    expect(rejected.outcome).toBe('applied');
    if (rejected.outcome !== 'applied') throw new Error('unreachable');
    expect(rejected.canonicalPlaceId).toBeNull();

    const rowAfterReject = await harness.asAdmin(`SELECT canonical_place_id FROM destination_places WHERE id = $1`, [
      newRow.id,
    ]);
    expect(rowAfterReject[0].canonical_place_id).toBeNull();

    // The FIRST (existing, colliding) row is completely unaffected by
    // resolving the second one.
    const existingRowAfter = await harness.asAdmin(`SELECT * FROM destination_places WHERE id = $1`, [existingRow.id]);
    expect(existingRowAfter[0]).toEqual(existingRow);
    expect(second.failed).toEqual([]);
  });
});
