// ─────────────────────────────────────────────────────────────────────────────
// HIGH-2 — the evidence ledger is not client-writable.
//
// WHAT THE REVIEW PROVED: a plain authenticated PostgREST call could write
// `resolution_confidence = 1`, `resolver_version = 'resolution-v999'` and
// fabricated `reason_signals` straight into the table Phase 13 exists to
// measure from. Migration 012 had already diagnosed the identical shape for
// ai_usage_log — "the policy constrained WHOSE row could be written but not
// what was in it… A ledger anybody can write is not a ledger" — and closed it
// by removing the write policy.
//
// The remediation closes it two ways at once, and both are attacked here:
//   1. Migration 017's guard refuses ANY insert or update that did not come
//      through the resolution functions (a transaction-local marker only they
//      set; PostgREST runs each request in its own transaction and offers no
//      way to set it and then write in the same one).
//   2. The evidence is not a parameter anywhere. create_place_resolution_
//      proposal takes no confidence, no version and no signals — it measures
//      the distance, counts the competing candidates and checks the countries
//      itself, then computes the score with the SQL twin of
//      lib/places/resolutionConfidence.ts.
//
// Real Postgres, real policies, real triggers. Attacks are performed, not
// described.
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

async function destinationPlace(userId: string, name = 'Blue Cafe', lat = 13.74659): Promise<string> {
  const { data } = await harness
    .clientFor(userId)
    .from('destination_places')
    .insert({
      destination: 'Thailand',
      name,
      category: 'food',
      description: '',
      lat,
      lng: 100.4927,
      created_by: userId,
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

async function publishedPlace(slug: string, name = 'Blue Cafe', lat = 13.7465): Promise<string> {
  const { data } = await harness
    .serviceClient()
    .from('places')
    .insert({
      slug,
      name,
      country_name: 'Thailand',
      latitude: lat,
      longitude: 100.4927,
      verification_status: 'domner_public',
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

/** The legitimate path: the importer records an ambiguous proposal. */
function propose(userId: string, destinationPlaceId: string, proposedPlaceId: string, alternatives: string[] = []) {
  return harness.clientFor(userId).rpc('create_place_resolution_proposal', {
    p_destination_place_id: destinationPlaceId,
    p_proposed_place_id: proposedPlaceId,
    p_alternative_place_ids: alternatives,
    p_pin_origin: 'geocoder',
    p_geocoder_result_count: 3,
    p_geocoder_country_mismatch: null,
    p_import_id: null,
    p_import_candidate_id: null,
  });
}

describe('the legitimate path works', () => {
  it('an RPC-generated pending proposal succeeds, with server-derived evidence', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-a');

    const { data, error } = await propose(ALICE, dp, place);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      decision: 'pending',
      user_id: ALICE,
      proposed_place_id: place,
      resolver_version: 'resolution-v1',
    });

    const row = (await harness.rows('place_resolution_feedback'))[0];
    // 0.773 is the score the SQL twin computes for a geocoder pin ~10m out
    // with no competing candidate — nothing the caller said, and pinned here
    // so a change to the formula has to be deliberate.
    expect(Number(row.resolution_confidence)).toBe(0.773);
    expect((row.reason_signals as Record<string, unknown>).pinOrigin).toBe('geocoder');
  });

  it('the decision RPC succeeds and applies the pointer', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-b');
    await propose(ALICE, dp, place);

    const { data, error } = await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_corrected_place_id: null,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ decision: 'confirmed' });
    expect((await harness.rows('destination_places'))[0].canonical_place_id).toBe(place);
  });
});

describe('direct writes are refused, whatever they carry', () => {
  it('a direct INSERT with forged confidence, version and signals is refused', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-c');

    const { error } = await harness.clientFor(ALICE).from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'confirmed',
      proposed_place_id: place,
      resolution_confidence: 1,
      resolver_version: 'resolution-v999',
      reason_signals: { fabricated: true, distanceMeters: 0 },
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('a direct INSERT is refused even when every value in it is honest', async () => {
    // The rule is the PATH, not the payload — otherwise "is this value
    // plausible?" becomes the security boundary.
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-d');

    const { error } = await harness.clientFor(ALICE).from('place_resolution_feedback').insert({
      user_id: ALICE,
      destination_place_id: dp,
      decision: 'pending',
      proposed_place_id: place,
      resolution_confidence: 0.774,
      resolver_version: 'resolution-v1',
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('a direct UPDATE cannot rewrite the evidence on a real proposal', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-e');
    await propose(ALICE, dp, place);
    const before = (await harness.rows('place_resolution_feedback'))[0];

    const { error } = await harness
      .clientFor(ALICE)
      .from('place_resolution_feedback')
      .update({
        resolution_confidence: 1,
        resolver_version: 'resolution-v999',
        reason_signals: { fabricated: true },
      })
      .eq('destination_place_id', dp);

    expect(error).not.toBeNull();
    const after = (await harness.rows('place_resolution_feedback'))[0];
    expect(Number(after.resolution_confidence)).toBe(Number(before.resolution_confidence));
    expect(after.resolver_version).toBe('resolution-v1');
    expect(after.reason_signals).toEqual(before.reason_signals);
  });

  it('a direct UPDATE cannot flip the decision either', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-f');
    await propose(ALICE, dp, place);

    await harness
      .clientFor(ALICE)
      .from('place_resolution_feedback')
      .update({ decision: 'confirmed' })
      .eq('destination_place_id', dp);

    // Still pending, and — crucially — the pointer was never applied either.
    expect((await harness.rows('place_resolution_feedback'))[0].decision).toBe('pending');
    expect((await harness.rows('destination_places'))[0].canonical_place_id).toBeNull();
  });

  it('a direct DELETE cannot erase a decision', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-g');
    await propose(ALICE, dp, place);

    await harness.clientFor(ALICE).from('place_resolution_feedback').delete().eq('destination_place_id', dp);
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(1);
  });
});

describe('a proposal cannot be manufactured for something that is not yours or not real', () => {
  it('refuses a proposal for another traveler\'s destination place', async () => {
    const bobDp = await destinationPlace(BOB);
    const place = await publishedPlace('bc-h');

    const { data, error } = await propose(ALICE, bobDp, place);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('refuses a proposal naming a REAL but invisible canonical place', async () => {
    const dp = await destinationPlace(ALICE);
    // Bob's own unverified guess: real, and invisible to Alice under
    // places_read_public_or_own.
    const { data: hidden } = await harness.serviceClient().from('places').insert({
      slug: 'bobs-guess',
      name: 'Blue Cafe',
      country_name: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'unverified',
      created_by: BOB,
    }).select('id').single();

    const { data, error } = await propose(ALICE, dp, (hidden as { id: string }).id);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('a fabricated canonical UUID is refused the same way an invisible one is', async () => {
    const dp = await destinationPlace(ALICE);
    const fabricated = await propose(ALICE, dp, '99999999-9999-4999-8999-999999999999');

    const { data: hidden } = await harness.serviceClient().from('places').insert({
      slug: 'bobs-guess-2',
      name: 'Blue Cafe',
      country_name: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'unverified',
      created_by: BOB,
    }).select('id').single();
    const invisible = await propose(ALICE, dp, (hidden as { id: string }).id);

    // Same SQLSTATE and same message — no oracle telling a prober which of the
    // two they hit.
    expect((fabricated.error as { code?: string })?.code).toBe((invisible.error as { code?: string })?.code);
    expect((fabricated.error as { message?: string })?.message).toBe(
      (invisible.error as { message?: string })?.message
    );
  });

  it('refuses a proposal naming a visible place that is not actually a match', async () => {
    const dp = await destinationPlace(ALICE);
    // Published and visible, but 1000km away and differently named.
    const unrelated = await publishedPlace('unrelated', 'Somewhere Else', 22.0);

    const { data, error } = await propose(ALICE, dp, unrelated);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('refuses an alternative that is not a genuine competing match', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-i');
    const unrelated = await publishedPlace('unrelated-2', 'Somewhere Else', 22.0);

    const { data, error } = await propose(ALICE, dp, place, [unrelated]);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('refuses to record a proposal for a match that is not ambiguous', async () => {
    // An exact-coordinate match with a maps-link pin scores 1.0 — `auto`,
    // nothing to ask. Recording it would put a question on the record that was
    // never asked.
    const dp = await destinationPlace(ALICE, 'Blue Cafe', 13.7465);
    const place = await publishedPlace('bc-j');

    const { data, error } = await harness.clientFor(ALICE).rpc('create_place_resolution_proposal', {
      p_destination_place_id: dp,
      p_proposed_place_id: place,
      p_alternative_place_ids: [],
      p_pin_origin: 'maps-link',
      p_geocoder_result_count: null,
      p_geocoder_country_mismatch: null,
      p_import_id: null,
      p_import_candidate_id: null,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('cross-user privacy and decision integrity', () => {
  it('another traveler cannot read or modify the feedback', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-k');
    await propose(ALICE, dp, place);

    const bob = harness.clientFor(BOB);
    const { data: readable } = await bob.from('place_resolution_feedback').select('*');
    expect(readable).toHaveLength(0);

    await bob.from('place_resolution_feedback').update({ decision: 'rejected' }).eq('destination_place_id', dp);
    expect((await harness.rows('place_resolution_feedback'))[0].decision).toBe('pending');

    const { error } = await bob.rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_corrected_place_id: null,
    });
    expect(error).not.toBeNull();
  });

  it('decided_at stays server-controlled through the whole lifecycle', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-l');
    await propose(ALICE, dp, place);

    const pending = (await harness.rows('place_resolution_feedback'))[0];
    expect(new Date(pending.decided_at as string).getFullYear()).toBeGreaterThan(2020);

    await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_corrected_place_id: null,
    });
    const decided = (await harness.rows('place_resolution_feedback'))[0];
    expect(new Date(decided.decided_at as string).getFullYear()).toBeGreaterThan(2020);
  });

  it('a correction must name a place the proposal actually offered', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-m');
    const other = await publishedPlace('bc-n', 'Blue Cafe', 13.7474);
    // Propose WITHOUT offering `other` as an alternative.
    await propose(ALICE, dp, place, []);

    const { error } = await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'corrected',
      p_corrected_place_id: other,
    });
    expect(error).not.toBeNull();
    expect((await harness.rows('destination_places'))[0].canonical_place_id).toBeNull();
  });

  it('a correction to an offered alternative is applied', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-o');
    const other = await publishedPlace('bc-p', 'Blue Cafe', 13.7474);
    await propose(ALICE, dp, place, [other]);

    const { error } = await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'corrected',
      p_corrected_place_id: other,
    });
    expect(error).toBeNull();
    expect((await harness.rows('destination_places'))[0].canonical_place_id).toBe(other);
  });

  it('confirmation still cannot alter verification_status', async () => {
    const dp = await destinationPlace(ALICE);
    // Alice's OWN unverified place — visible to her, so a genuine proposal,
    // and the one case where a promotion would actually be visible.
    const { data: own } = await harness.serviceClient().from('places').insert({
      slug: 'alice-own',
      name: 'Blue Cafe',
      country_name: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'unverified',
      created_by: ALICE,
    }).select('id').single();
    const placeId = (own as { id: string }).id;

    await propose(ALICE, dp, placeId);
    await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_corrected_place_id: null,
    });

    const places = await harness.rows('places');
    expect(places.find((p) => p.id === placeId)?.verification_status).toBe('unverified');
  });
});

describe('atomicity, replay and concurrency', () => {
  it('the pointer update rolls back when the feedback write fails', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-q');
    await propose(ALICE, dp, place);

    // FAULT INJECTION. The RPC updates destination_places FIRST and the
    // feedback row SECOND, so the only way to prove the first is rolled back
    // is to make the second fail. Nothing a caller can send does that any more
    // (the function derives or sanitises every value it writes), which is the
    // point — so the fault is installed at the database instead, as a trigger
    // that fires after the guard and refuses the decision write.
    await harness.execAsAdmin(`
      CREATE FUNCTION zz_fault() RETURNS TRIGGER AS $f$
      BEGIN RAISE EXCEPTION 'injected failure'; END;
      $f$ LANGUAGE plpgsql;
      CREATE TRIGGER zz_fault_trg BEFORE UPDATE ON place_resolution_feedback
        FOR EACH ROW EXECUTE FUNCTION zz_fault();
    `);

    const { error } = await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_corrected_place_id: null,
    });
    expect(error).not.toBeNull();

    await harness.execAsAdmin(`
      DROP TRIGGER zz_fault_trg ON place_resolution_feedback;
      DROP FUNCTION zz_fault();
    `);

    // Neither half landed: the pointer write is inside the same transaction
    // the failed feedback write aborted.
    expect((await harness.rows('destination_places'))[0].canonical_place_id).toBeNull();
    expect((await harness.rows('place_resolution_feedback'))[0].decision).toBe('pending');
  });

  it('a confirmation carrying a stray correctedPlaceId is sanitised, not stored', async () => {
    // The pairing CHECK forbids `confirmed` + corrected_place_id, and the RPC
    // never lets that combination reach the table — the correction id is
    // simply ignored for a decision that is not a correction.
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-q2');
    await propose(ALICE, dp, place);

    const { error } = await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'confirmed',
      p_corrected_place_id: place,
    });
    expect(error).toBeNull();

    const row = (await harness.rows('place_resolution_feedback'))[0];
    expect(row.decision).toBe('confirmed');
    expect(row.corrected_place_id).toBeNull();
  });

  it('replay is idempotent — no duplicate rows, no partial transition', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-r');
    await propose(ALICE, dp, place);

    const alice = harness.clientFor(ALICE);
    const call = (d: string) =>
      alice.rpc('apply_place_resolution_feedback', {
        p_destination_place_id: dp,
        p_decision: d,
        p_corrected_place_id: null,
      });

    await call('confirmed');
    await call('confirmed');
    await call('rejected');

    const rows = await harness.rows('place_resolution_feedback');
    expect(rows).toHaveLength(1);
    expect(rows[0].decision).toBe('rejected');
    expect((await harness.rows('destination_places'))[0].canonical_place_id).toBeNull();
  });

  it('concurrent decisions leave the pointer and the feedback agreeing', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-s');
    await propose(ALICE, dp, place);

    const alice = harness.clientFor(ALICE);
    const call = (d: string) =>
      alice.rpc('apply_place_resolution_feedback', {
        p_destination_place_id: dp,
        p_decision: d,
        p_corrected_place_id: null,
      });

    await Promise.all([call('confirmed'), call('rejected'), call('confirmed')]);

    const rows = await harness.rows('place_resolution_feedback');
    expect(rows).toHaveLength(1);
    const pointer = (await harness.rows('destination_places'))[0].canonical_place_id;
    if (rows[0].decision === 'rejected') expect(pointer).toBeNull();
    else expect(pointer).toBe(place);
  });

  it('re-proposing does not reopen or overwrite a decision already made', async () => {
    const dp = await destinationPlace(ALICE);
    const place = await publishedPlace('bc-t');
    await propose(ALICE, dp, place);
    await harness.clientFor(ALICE).rpc('apply_place_resolution_feedback', {
      p_destination_place_id: dp,
      p_decision: 'rejected',
      p_corrected_place_id: null,
    });

    await propose(ALICE, dp, place);

    const rows = await harness.rows('place_resolution_feedback');
    expect(rows).toHaveLength(1);
    expect(rows[0].decision).toBe('rejected');
  });
});
