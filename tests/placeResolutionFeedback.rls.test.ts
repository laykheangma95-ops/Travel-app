// ─────────────────────────────────────────────────────────────────────────────
// place_resolution_feedback (migration 017), against a REAL Postgres with the
// REAL policies — direct table access, not through the confirm route or the
// RPC. tests/destinationPlaceResolution.route.test.ts already proves the
// route's own behaviour end to end; this file proves the boundary holds even
// for a caller that skips the route and the RPC entirely and talks to
// PostgREST directly with their own anon-key session, which is exactly what
// migration 017's own comments say a determined caller can always do.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

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

async function aliceDestinationPlace(name = 'Wat Pho'): Promise<string> {
  const alice = harness.clientFor(ALICE);
  const { data } = await alice
    .from('destination_places')
    .insert({
      destination: 'Thailand',
      name,
      category: 'spot',
      description: '',
      lat: 13.7465,
      lng: 100.4927,
      created_by: ALICE,
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

async function publishedPlace(slug: string, lat = 13.7465): Promise<string> {
  const service = harness.serviceClient();
  const { data } = await service
    .from('places')
    .insert({ slug, name: 'Wat Pho', country_name: 'Thailand', latitude: lat, longitude: 100.4927, verification_status: 'domner_public' })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

describe('SELECT: own feedback only', () => {
  it('Alice cannot read Bob\'s feedback', async () => {
    const bobDp = await (async () => {
      const bob = harness.clientFor(BOB);
      const { data } = await bob
        .from('destination_places')
        .insert({ destination: 'Thailand', name: 'Bobs Place', category: 'spot', description: '', lat: 1, lng: 1, created_by: BOB })
        .select('id')
        .single();
      return (data as { id: string }).id;
    })();
    const place = await publishedPlace('bob-place', 1);
    const bob = harness.clientFor(BOB);
    await bob.rpc('apply_place_resolution_feedback', {
      p_destination_place_id: bobDp,
      p_decision: 'confirmed',
      p_proposed_place_id: place,
      p_corrected_place_id: null,
      p_resolution_confidence: 0.9,
      p_resolver_version: 'resolution-v1',
      p_reason_signals: null,
      p_import_id: null,
      p_import_candidate_id: null,
    });

    const alice = harness.clientFor(ALICE);
    const { data } = await alice.from('place_resolution_feedback').select('*');
    expect(data).toHaveLength(0);
  });
});

describe('INSERT: own feedback about your own destination place only', () => {
  it('refuses a direct insert naming another traveler\'s destination_place_id', async () => {
    const bobDp = await (async () => {
      const bob = harness.clientFor(BOB);
      const { data } = await bob
        .from('destination_places')
        .insert({ destination: 'Thailand', name: 'Bobs Place', category: 'spot', description: '', lat: 1, lng: 1, created_by: BOB })
        .select('id')
        .single();
      return (data as { id: string }).id;
    })();
    const place = await publishedPlace('bob-place-2', 1);

    const alice = harness.clientFor(ALICE);
    const { error } = await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: bobDp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('refuses a direct insert claiming to be a different user_id', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-a');

    const alice = harness.clientFor(ALICE);
    const { error } = await alice.from('place_resolution_feedback').insert({
      user_id: BOB,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('permits a direct insert about your own place, about your own decision', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-b');

    const alice = harness.clientFor(ALICE);
    const { error } = await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
    });

    expect(error).toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(1);
  });
});

describe('the corrected/decision pairing is enforced by the database, not the app', () => {
  it('refuses "corrected" with no corrected_place_id', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-c');
    const alice = harness.clientFor(ALICE);

    const { error } = await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'corrected',
      proposed_place_id: place,
      corrected_place_id: null,
      resolver_version: 'resolution-v1',
    });

    expect(error).not.toBeNull();
  });

  it('refuses "confirmed" carrying a corrected_place_id', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-d');
    const alice = harness.clientFor(ALICE);

    const { error } = await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      corrected_place_id: place,
      resolver_version: 'resolution-v1',
    });

    expect(error).not.toBeNull();
  });
});

describe('decided_at and immutable fields cannot be forged', () => {
  it('a client-supplied decided_at is overwritten by the trigger', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-e');
    const alice = harness.clientFor(ALICE);

    const forged = '2000-01-01T00:00:00Z';
    await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
      decided_at: forged,
    });

    const rows = await harness.rows('place_resolution_feedback');
    expect(new Date(rows[0].decided_at as string).getFullYear()).toBeGreaterThan(2000);
  });

  it('destination_place_id cannot be retargeted on update', async () => {
    const dp = await aliceDestinationPlace('Wat Pho');
    const otherDp = await aliceDestinationPlace('Wat Arun');
    const place = await publishedPlace('wat-pho-f');
    const alice = harness.clientFor(ALICE);

    await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
    });

    await alice
      .from('place_resolution_feedback')
      .update({ destination_place_id: otherDp })
      .eq('destination_place_id', dp);

    const rows = await harness.rows('place_resolution_feedback');
    expect(rows).toHaveLength(1);
    expect(rows[0].destination_place_id).toBe(dp);
  });
});

describe('no DELETE policy', () => {
  it('a traveler cannot delete their own feedback', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-g');
    const alice = harness.clientFor(ALICE);

    await alice.from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
    });

    await alice.from('place_resolution_feedback').delete().eq('destination_place_id', dp);

    expect(await harness.rows('place_resolution_feedback')).toHaveLength(1);
  });
});

describe('the RPC needs no service_role', () => {
  it('a plain authenticated session can call apply_place_resolution_feedback end to end', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-h');
    const alice = harness.clientFor(ALICE);

    const { data, error } = await alice.rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_proposed_place_id: place,
      p_corrected_place_id: null,
      p_resolution_confidence: 0.9,
      p_resolver_version: 'resolution-v1',
      p_reason_signals: null,
      p_import_id: null,
      p_import_candidate_id: null,
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ decision: 'confirmed' });
  });

  it('refuses a direct RPC call naming a REAL but invisible place as the proposal', async () => {
    // Bypasses lib/places/resolutionFeedback.ts's own re-derivation entirely —
    // this is the RPC's OWN visibility check being exercised, not the app
    // layer's. An unverified place Bob created is invisible to Alice under
    // places_read_public_or_own (migration 013) whether or not it exists.
    const dp = await aliceDestinationPlace();
    const bobsUnverifiedGuess = await (async () => {
      const service = harness.serviceClient();
      const { data } = await service
        .from('places')
        .insert({
          slug: 'bobs-unverified-guess',
          name: 'Bobs Guess',
          country_name: 'Thailand',
          latitude: 13.7465,
          longitude: 100.4927,
          verification_status: 'unverified',
          created_by: BOB,
        })
        .select('id')
        .single();
      return (data as { id: string }).id;
    })();

    const alice = harness.clientFor(ALICE);
    const { data, error } = await alice.rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_proposed_place_id: bobsUnverifiedGuess,
      p_corrected_place_id: null,
      p_resolution_confidence: 0.9,
      p_resolver_version: 'resolution-v1',
      p_reason_signals: null,
      p_import_id: null,
      p_import_candidate_id: null,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dp)?.canonical_place_id).toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('a fabricated corrected_place_id is indistinguishable from an invisible one', async () => {
    const dp = await aliceDestinationPlace();
    const place = await publishedPlace('wat-pho-i');
    const alice = harness.clientFor(ALICE);

    const fabricated = '99999999-9999-4999-8999-999999999999';
    const { data, error } = await alice.rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'corrected',
      p_proposed_place_id: place,
      p_corrected_place_id: fabricated,
      p_resolution_confidence: 0.6,
      p_resolver_version: 'resolution-v1',
      p_reason_signals: null,
      p_import_id: null,
      p_import_candidate_id: null,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dp)?.canonical_place_id).toBeNull();
  });
});
