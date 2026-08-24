// ─────────────────────────────────────────────────────────────────────────────
// The saved-place library, against a REAL Postgres with the REAL policies.
//
// The properties under test are the ones a library has to hold or it is not
// worth having:
//
//   1. A save exists WITHOUT A TRIP. Nothing in this file creates one.
//   2. Saving twice is saving once — enforced by a unique index, not by the
//      application remembering to check first.
//   3. Unsaving CANNOT reach the canonical place. That is the difference
//      between a bookmark and a delete button, and it is a foreign key rather
//      than a promise.
//   4. One traveler's library is invisible to another.
//   5. The save COUNT is public; who saved it is not.
//
// PGlite is Postgres itself, so the policies and the counter trigger below are
// the ones that will run in production.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getSavedDestinations,
  getSavedPlaces,
  getSavedPlacesByDestination,
  getSaveCounts,
  isPlaceSaved,
  savedPlaceIdsAmong,
  savePlace,
  unsavePlace,
} from '@/lib/places/saved';
import { resolveProviderPlace, promotePlace } from '@/lib/places/repository';
import type { ProviderPlace } from '@/lib/providers/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function providerPlace(overrides: Partial<ProviderPlace> = {}): ProviderPlace {
  return {
    providerId: 'sandbox',
    providerPlaceId: 'p-wat-pho',
    name: 'Wat Pho',
    localName: 'วัดโพธิ์',
    countryCode: 'TH',
    countryName: 'Thailand',
    city: 'Bangkok',
    district: null,
    neighborhood: null,
    latitude: 13.7465,
    longitude: 100.4927,
    address: '2 Sanamchai Road, Bangkok',
    website: null,
    phone: null,
    priceLevel: null,
    category: 'spot',
    subcategory: 'temple',
    ...overrides,
  };
}

let harness: Harness;

/** A published canonical place, which is what a traveler is able to save. */
async function publishedPlace(overrides: Partial<ProviderPlace> = {}): Promise<string> {
  const service = harness.serviceClient();
  const resolved = await resolveProviderPlace(service, providerPlace(overrides));
  await promotePlace(service, resolved!.place.id, 'domner_public', {
    actor: 'staff:test',
    reason: 'test fixture',
  });
  return resolved!.place.id;
}

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

describe('saving, with no trip anywhere', () => {
  it('saves a canonical place and reports it as saved', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);

    expect(await isPlaceSaved(alice, ALICE, placeId)).toBe(false);

    const result = await savePlace(alice, ALICE, placeId);
    expect(result).toEqual({ saved: true, alreadySaved: false });
    expect(await isPlaceSaved(alice, ALICE, placeId)).toBe(true);

    // The whole point: no trip was created, and none was needed.
    expect(await harness.rows('trip_plans')).toHaveLength(0);
    expect(await harness.rows('itinerary_days')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });

  it('returns the saved place with its place attached', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    const [saved] = await getSavedPlaces(alice, ALICE);
    expect(saved).toMatchObject({
      placeId,
      name: 'Wat Pho',
      // Compared against the fixture rather than a re-typed literal. Typing this
      // twice already produced a Thai word containing a Khmer vowel sign — two
      // strings that render identically and are not equal.
      localName: providerPlace().localName,
      countryName: 'Thailand',
      city: 'Bangkok',
      category: 'spot',
      saveCount: 1,
    });
    // Coordinates come back as numbers, not the strings a numeric column
    // yields through a driver.
    expect(typeof saved.latitude).toBe('number');
    expect(saved.latitude).toBeCloseTo(13.7465, 4);
  });
});

describe('duplicate saves and idempotency', () => {
  it('saving twice creates one row and says which happened', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);

    const first = await savePlace(alice, ALICE, placeId);
    const second = await savePlace(alice, ALICE, placeId);

    expect(first).toEqual({ saved: true, alreadySaved: false });
    expect(second).toEqual({ saved: true, alreadySaved: true });
    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('holds under a burst of simultaneous saves', async () => {
    // A double tap, or a client retrying. Read-then-write would leave a window
    // between the two in which both attempts see "not saved"; a unique index
    // does not have one.
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => savePlace(alice, ALICE, placeId))
    );

    expect(results.every((result) => result?.saved)).toBe(true);
    expect(results.filter((result) => result?.alreadySaved === false)).toHaveLength(1);
    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('the raw insert is refused by the database, not just by the module', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    const { error } = await alice
      .from('saved_places')
      .insert({ user_id: ALICE, place_id: placeId });

    expect(error?.code).toBe('23505');
    expect(String(error?.message)).toContain('saved_places_user_place_idx');
  });

  it('unsaving twice is a success both times', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    expect(await unsavePlace(alice, ALICE, placeId)).toEqual({ removed: true });
    // The intent — "this should not be in my library" — is satisfied either way.
    expect(await unsavePlace(alice, ALICE, placeId)).toEqual({ removed: false });
    expect(await isPlaceSaved(alice, ALICE, placeId)).toBe(false);
  });
});

describe('unsaving never touches the canonical place', () => {
  it('leaves the place, its provider mapping and its verification intact', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);
    await unsavePlace(alice, ALICE, placeId);

    const places = await harness.rows('places');
    expect(places).toHaveLength(1);
    expect(places[0].id).toBe(placeId);
    expect(places[0].verification_status).toBe('domner_public');
    expect(await harness.rows('place_external_ids')).toHaveLength(1);
  });

  it('refuses to let a place be deleted while somebody has it saved', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    // ON DELETE RESTRICT, exercised as the service role — the one caller that
    // could otherwise get past every policy.
    const { error } = await harness.serviceClient().from('places').delete().eq('id', placeId);
    expect(String(error?.message)).toContain('saved_places');
    expect(await harness.rows('places')).toHaveLength(1);
  });

  it('survives the last save being removed', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    const bob = harness.clientFor(BOB);
    await savePlace(alice, ALICE, placeId);
    await savePlace(bob, BOB, placeId);

    await unsavePlace(alice, ALICE, placeId);
    await unsavePlace(bob, BOB, placeId);

    expect(await harness.rows('places')).toHaveLength(1);
    const [stats] = await harness.rows('place_stats');
    expect(stats.save_count).toBe(0);
  });
});

describe('one traveler cannot reach another traveler\'s library', () => {
  it('hides the rows entirely', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    const bob = harness.clientFor(BOB);
    expect(await getSavedPlaces(bob, BOB)).toEqual([]);
    expect(await isPlaceSaved(bob, BOB, placeId)).toBe(false);
    const { data } = await bob.from('saved_places').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses a save stamped with somebody else\'s id', async () => {
    const placeId = await publishedPlace();
    const bob = harness.clientFor(BOB);

    const { error } = await bob.from('saved_places').insert({ user_id: ALICE, place_id: placeId });
    expect(error).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('cannot delete another traveler\'s save', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    // Bob asks for Alice's row by id. RLS filters it out, so nothing is removed.
    await harness.clientFor(BOB).from('saved_places').delete().eq('place_id', placeId);
    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('cannot move a save to another traveler or another place', async () => {
    const placeId = await publishedPlace();
    const other = await publishedPlace({ providerPlaceId: 'p-jodd', name: 'Jodd Fairs', latitude: 13.7563, longitude: 100.5665 });
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    // Re-pointing a save would move two places' counters without the counter
    // trigger noticing, because it only fires on INSERT and DELETE.
    await alice.from('saved_places').update({ user_id: BOB, place_id: other }).eq('place_id', placeId);

    const [row] = await harness.rows('saved_places');
    expect(row.user_id).toBe(ALICE);
    expect(row.place_id).toBe(placeId);
  });
});

describe('a place the traveler cannot see', () => {
  it('cannot be saved, even though a foreign key does not care about RLS', async () => {
    // FOUND IN TESTING, and worth keeping: a foreign key is enforced by the
    // database regardless of row-level security. A policy pinning only the
    // owner therefore still let a traveler insert a save naming somebody
    // else's unverified place. Nothing leaked — the library view joins
    // `places` and filters it straight back out — but a write that succeeds
    // for one id and fails for another is an oracle for enumerating other
    // people's places, and it moved their save_count.
    const [secret] = await harness.asAdmin(
      `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
       VALUES ('t:bob-secret','Bob Secret','Thailand','food',13.1,100.1,$1) RETURNING id`,
      [BOB]
    );
    const placeId = secret.id as string;

    const alice = harness.clientFor(ALICE);
    expect(await savePlace(alice, ALICE, placeId)).toBeNull();

    const { error } = await alice.from('saved_places').insert({ user_id: ALICE, place_id: placeId });
    expect(error).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
    // And no counter moved for a place she cannot see.
    const [stats] = (await harness.rows('place_stats')).filter((row) => row.place_id === placeId);
    expect(stats?.save_count ?? 0).toBe(0);
  });

  it('can still be saved by the traveler who created it', async () => {
    // The other half of the rule: your own unverified place is yours to keep.
    const [mine] = await harness.asAdmin(
      `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
       VALUES ('t:alice-cafe','Alice Cafe','Thailand','food',13.2,100.2,$1) RETURNING id`,
      [ALICE]
    );
    const alice = harness.clientFor(ALICE);
    expect(await savePlace(alice, ALICE, mine.id as string)).toEqual({
      saved: true,
      alreadySaved: false,
    });
  });
});

describe('unauthenticated access', () => {
  it('reads and writes nothing', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    // No `sub` claim: auth.uid() is null, so every own-row policy is false.
    const anonymous = harness.clientFor('00000000-0000-4000-8000-000000000000');
    const { data } = await anonymous.from('saved_places').select('id');
    expect(data ?? []).toHaveLength(0);

    const { error } = await anonymous
      .from('saved_places')
      .insert({ user_id: ALICE, place_id: placeId });
    expect(error).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(1);
  });
});

describe('save counts', () => {
  it('counts every traveler who saved a place, and nobody who did not', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);
    await savePlace(harness.clientFor(BOB), BOB, placeId);

    const counts = await getSaveCounts(harness.clientFor(ALICE), [placeId]);
    expect(counts.get(placeId)).toBe(2);
  });

  it('goes back down when a save is removed', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);
    await savePlace(harness.clientFor(BOB), BOB, placeId);

    await unsavePlace(alice, ALICE, placeId);

    const counts = await getSaveCounts(alice, [placeId]);
    expect(counts.get(placeId)).toBe(1);
  });

  it('is not moved by a repeated save', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);
    await savePlace(alice, ALICE, placeId);
    await savePlace(alice, ALICE, placeId);

    const counts = await getSaveCounts(alice, [placeId]);
    expect(counts.get(placeId)).toBe(1);
  });

  it('agrees with the truth it is a cache of', async () => {
    // The reconciliation query from the docs, as an assertion.
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);
    await savePlace(harness.clientFor(BOB), BOB, placeId);
    await unsavePlace(harness.clientFor(BOB), BOB, placeId);

    const [drift] = await harness.asAdmin(`
      SELECT count(*) AS mismatched FROM place_stats st
      WHERE st.save_count <> (SELECT count(*) FROM saved_places s WHERE s.place_id = st.place_id)`);
    expect(Number(drift.mismatched)).toBe(0);
  });

  it('is public as a number, and exposes nobody', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    // Bob reads the count without being able to read a single save row.
    const bob = harness.clientFor(BOB);
    const counts = await getSaveCounts(bob, [placeId]);
    expect(counts.get(placeId)).toBe(1);

    const { data: saves } = await bob.from('saved_places').select('user_id');
    expect(saves ?? []).toHaveLength(0);

    // And the counter itself is not writable by anyone.
    const { error } = await bob.from('place_stats').update({ save_count: 9999 }).eq('place_id', placeId);
    const [stats] = await harness.rows('place_stats');
    expect(stats.save_count).toBe(1);
    expect(error === null || stats.save_count === 1).toBe(true);
  });
});

describe('listing and filtering', () => {
  it('filters by destination in the database', async () => {
    const thai = await publishedPlace();
    const china = await publishedPlace({
      providerPlaceId: 'p-bund',
      name: 'The Bund',
      countryName: 'China',
      countryCode: 'CN',
      city: 'Shanghai',
      latitude: 31.2397,
      longitude: 121.4909,
    });
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, thai);
    await savePlace(alice, ALICE, china);

    expect(await getSavedPlaces(alice, ALICE)).toHaveLength(2);

    const thailandOnly = await getSavedPlacesByDestination(alice, ALICE, 'Thailand');
    expect(thailandOnly).toHaveLength(1);
    expect(thailandOnly[0].countryName).toBe('Thailand');

    expect(await getSavedPlacesByDestination(alice, ALICE, 'Japan')).toEqual([]);
  });

  it('lists the countries a traveler has saves in', async () => {
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, await publishedPlace());
    await savePlace(
      alice,
      ALICE,
      await publishedPlace({
        providerPlaceId: 'p-bund',
        name: 'The Bund',
        countryName: 'China',
        latitude: 31.2397,
        longitude: 121.4909,
      })
    );

    const destinations = await getSavedDestinations(alice, ALICE);
    expect(destinations.map((entry) => entry.destination).sort()).toEqual(['China', 'Thailand']);
  });

  it('answers a whole screen of cards in one query', async () => {
    // The N+1 this phase was told to avoid: twenty cards must not mean twenty
    // `isPlaceSaved` calls.
    const saved = await publishedPlace();
    const notSaved = await publishedPlace({
      providerPlaceId: 'p-jodd',
      name: 'Jodd Fairs',
      latitude: 13.7563,
      longitude: 100.5665,
    });
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, saved);

    const ids = await savedPlaceIdsAmong(alice, ALICE, [saved, notSaved]);
    expect(ids.has(saved)).toBe(true);
    expect(ids.has(notSaved)).toBe(false);
    expect(await savedPlaceIdsAmong(alice, ALICE, [])).toEqual(new Set());
  });

  it('drops a place the traveler may no longer see', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    // A place found to be wrong is marked rejected rather than deleted. The
    // save row survives; the library stops showing it, because the view is
    // security_invoker and RLS on `places` no longer matches.
    await promotePlace(harness.serviceClient(), placeId, 'rejected', {
      actor: 'staff:test',
      reason: 'not a real place',
    });

    expect(await getSavedPlaces(alice, ALICE)).toEqual([]);
    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('does not leak another traveler\'s saves through the view', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    const { data } = await harness.clientFor(BOB).from('saved_places_detailed').select('saved_id');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('the existing trip-save is untouched', () => {
  it('leaves destination_places and the itinerary tables alone', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);
    await unsavePlace(alice, ALICE, placeId);

    // Phase 2 adds a library beside the trip save. It does not write a single
    // row into anything the trip save uses.
    expect(await harness.rows('destination_places')).toHaveLength(0);
    expect(await harness.rows('trip_plans')).toHaveLength(0);
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });
});
