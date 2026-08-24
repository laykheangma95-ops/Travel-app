// ─────────────────────────────────────────────────────────────────────────────
// The canonical registry, against a REAL Postgres with the REAL policies.
//
// Three promises are being tested, and they are the three the registry exists
// to make:
//
//   1. ONE ROW PER PLACE. A hundred travelers saving the same night market must
//      produce one canonical record, whether they arrive through a provider id
//      or through a caption with a slightly different spelling.
//
//   2. AN AI GUESS CANNOT BECOME TRUSTED PUBLIC DATA. Not "the code does not do
//      that" — there is no request, no payload and no argument that reaches
//      `provider_verified` or `domner_public` from a traveler's session. That
//      is RLS and a trigger, and it is asserted here by trying.
//
//   3. NOBODY'S UNVERIFIED GUESS LEAKS. A place one traveler submitted is
//      invisible to another until it is published.
//
// PGlite is Postgres itself, so these policies are enforced by the same engine
// Supabase runs. `harness.serviceClient()` stands in for the service-role key.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attachCanonicalPlace,
  findNearbyByName,
  findPlaceByProviderId,
  getPlaceById,
  linkProviderPlace,
  promotePlace,
  resolvePlaceForTraveler,
  resolveProviderPlace,
} from '@/lib/places/repository';
import type { ProviderPlace } from '@/lib/providers/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

/** Wat Pho, and the same place as three different people would type it. */
const WAT_PHO = { name: 'Wat Pho', countryName: 'Thailand', latitude: 13.7465, longitude: 100.4927 };

const PROVIDER_WAT_PHO: ProviderPlace = {
  providerId: 'sandbox',
  providerPlaceId: 'ChIJ-wat-pho-123',
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
  website: 'https://www.watpho.com',
  phone: null,
  priceLevel: 1,
  category: 'spot',
  subcategory: 'temple',
};

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

describe('one canonical record per real-world place', () => {
  it('resolves a second traveler onto the first traveler\'s place once it is published', async () => {
    const alice = harness.clientFor(ALICE);
    const service = harness.serviceClient();

    const first = await resolvePlaceForTraveler(alice, ALICE, WAT_PHO);
    expect(first?.matchedBy).toBe('created');
    expect(first?.place.verificationStatus).toBe('unverified');

    // Published, so it is now a shared fact rather than one person's note.
    await linkProviderPlace(service, first!.place.id, 'sandbox', 'ChIJ-wat-pho-123');
    await promotePlace(service, first!.place.id, 'provider_verified', {
      actor: 'provider:sandbox',
      reason: 'test',
    });
    await promotePlace(service, first!.place.id, 'domner_public', {
      actor: 'staff:owner@domner.test',
      reason: 'test',
    });

    // Bob pastes the same place, spelled differently, from 40 metres away.
    const bob = harness.clientFor(BOB);
    const second = await resolvePlaceForTraveler(bob, BOB, {
      ...WAT_PHO,
      name: 'wat  pho!',
      latitude: 13.7468,
      longitude: 100.4928,
    });

    expect(second?.matchedBy).toBe('proximity');
    expect(second?.place.id).toBe(first!.place.id);
    expect(await harness.rows('places')).toHaveLength(1);
  });

  it('gives a hundred provider imports one row', async () => {
    const service = harness.serviceClient();

    const first = await resolveProviderPlace(service, PROVIDER_WAT_PHO);
    expect(first?.matchedBy).toBe('created');

    // Everybody after the first matches on the provider's id — the strongest
    // evidence there is, and immune to however the caption spelled it.
    for (let i = 0; i < 5; i += 1) {
      const again = await resolveProviderPlace(service, {
        ...PROVIDER_WAT_PHO,
        name: `Wat Pho (entrance ${i})`,
        latitude: 13.7466,
      });
      expect(again?.matchedBy).toBe('provider-id');
      expect(again?.place.id).toBe(first!.place.id);
    }

    expect(await harness.rows('places')).toHaveLength(1);
    expect(await harness.rows('place_external_ids')).toHaveLength(1);
  });

  it('does not merge two different places that share a name', async () => {
    const service = harness.serviceClient();

    // Two 7-Elevens, 8km apart. Same name, different places.
    const bangkok = await resolveProviderPlace(service, {
      ...PROVIDER_WAT_PHO,
      providerPlaceId: 'p-1',
      name: '7-Eleven',
      latitude: 13.7465,
      longitude: 100.4927,
    });
    const ratchada = await resolveProviderPlace(service, {
      ...PROVIDER_WAT_PHO,
      providerPlaceId: 'p-2',
      name: '7-Eleven',
      latitude: 13.7563,
      longitude: 100.5665,
    });

    expect(bangkok!.place.id).not.toBe(ratchada!.place.id);
    expect(await harness.rows('places')).toHaveLength(2);
  });

  it('refuses a duplicate at the database level, not just in the resolver', async () => {
    const service = harness.serviceClient();
    await resolveProviderPlace(service, PROVIDER_WAT_PHO);

    // What a concurrent insert that skipped the resolver would attempt.
    const { error } = await service.from('places').insert({
      slug: 'thailand:watpho-other',
      name: 'WAT PHO',
      country_name: 'Thailand',
      category: 'spot',
      latitude: 13.7465,
      longitude: 100.4927,
    });

    expect(error?.message ?? '').toContain('places_identity_idx');
  });

  it('refuses to point one provider id at two places', async () => {
    const service = harness.serviceClient();
    const first = await resolveProviderPlace(service, PROVIDER_WAT_PHO);

    const elsewhere = await resolveProviderPlace(service, {
      ...PROVIDER_WAT_PHO,
      name: 'Somewhere Else',
      latitude: 31.2397,
      longitude: 121.4909,
    });

    // The id already belongs to Wat Pho, so that is what comes back — a second
    // place is never created for an id we have already resolved.
    expect(elsewhere?.place.id).toBe(first!.place.id);
    expect(elsewhere?.matchedBy).toBe('provider-id');
  });
});

describe('an unverified place cannot promote itself', () => {
  it('refuses a traveler who asks to be verified or published', async () => {
    const alice = harness.clientFor(ALICE);
    const resolution = await resolvePlaceForTraveler(alice, ALICE, WAT_PHO);
    const placeId = resolution!.place.id;

    // Exactly what a direct PostgREST call would send. This is the request a
    // future AI pipeline would be making if it ran as the traveler — which it
    // does — and there is no body that gets past the policy.
    for (const status of ['provider_verified', 'domner_public']) {
      await alice.from('places').update({ verification_status: status }).eq('id', placeId);
    }

    const [row] = await harness.rows('places');
    expect(row.verification_status).toBe('unverified');
    expect(row.verified_at).toBeNull();
  });

  it('refuses an insert that claims a verification level', async () => {
    const alice = harness.clientFor(ALICE);
    const { error } = await alice.from('places').insert({
      slug: 'thailand:invented',
      name: 'Invented Place',
      country_name: 'Thailand',
      category: 'spot',
      latitude: 13.7,
      longitude: 100.5,
      created_by: ALICE,
      verification_status: 'domner_public',
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('places')).toHaveLength(0);
  });

  it('refuses to call a place provider_verified with no provider behind it', async () => {
    const service = harness.serviceClient();
    const alice = harness.clientFor(ALICE);
    const resolution = await resolvePlaceForTraveler(alice, ALICE, WAT_PHO);

    const refused = await promotePlace(service, resolution!.place.id, 'provider_verified', {
      actor: 'staff:owner@domner.test',
      reason: 'looks right to me',
    });
    expect(refused.status).toBe('refused');
    expect(refused.reason).toContain('provider mapping');

    // And the same attempt in raw SQL, past the repository, hits the trigger.
    await expect(
      harness.asAdmin(`UPDATE places SET verification_status = 'provider_verified'`)
    ).rejects.toThrow(/without a provider mapping/);
  });

  it('will not let a provider publish, only a person', async () => {
    const service = harness.serviceClient();
    const resolved = await resolveProviderPlace(service, PROVIDER_WAT_PHO);
    // resolveProviderPlace verifies, and stops there.
    expect(resolved!.place.verificationStatus).toBe('provider_verified');

    const refused = await promotePlace(service, resolved!.place.id, 'domner_public', {
      actor: 'provider:sandbox',
      reason: 'the provider knows this place',
    });
    expect(refused.status).toBe('refused');
    expect(refused.reason).toContain('human decision');

    const published = await promotePlace(service, resolved!.place.id, 'domner_public', {
      actor: 'staff:owner@domner.test',
      reason: 'checked and published',
    });
    expect(published.status).toBe('promoted');
    expect(published.place?.verificationStatus).toBe('domner_public');
    expect(published.place?.verifiedAt).not.toBeNull();
  });

  it('publishes an unverified place only under an explicit human override', async () => {
    const service = harness.serviceClient();
    const alice = harness.clientFor(ALICE);
    const resolution = await resolvePlaceForTraveler(alice, ALICE, WAT_PHO);

    const refused = await promotePlace(service, resolution!.place.id, 'domner_public', {
      actor: 'staff:owner@domner.test',
      reason: 'no provider configured yet',
    });
    expect(refused.status).toBe('refused');

    // The editorial case: a place we know is real because we have been there.
    const forced = await promotePlace(service, resolution!.place.id, 'domner_public', {
      actor: 'staff:owner@domner.test',
      reason: 'editorial: we have been there',
      override: true,
    });
    expect(forced.status).toBe('promoted');
  });
});

describe('one traveler cannot see another\'s unverified place', () => {
  it('hides it until it is published', async () => {
    const alice = harness.clientFor(ALICE);
    const bob = harness.clientFor(BOB);
    const service = harness.serviceClient();

    const resolution = await resolvePlaceForTraveler(alice, ALICE, WAT_PHO);
    const placeId = resolution!.place.id;

    // Alice sees her own submission; Bob does not see it at all.
    expect(await getPlaceById(alice, placeId)).not.toBeNull();
    expect(await getPlaceById(bob, placeId)).toBeNull();
    expect(await findNearbyByName(bob, { name: 'Wat Pho', lat: 13.7465, lng: 100.4927 })).toEqual([]);

    await linkProviderPlace(service, placeId, 'sandbox', 'x-1');
    await promotePlace(service, placeId, 'provider_verified', { actor: 'provider:sandbox', reason: 't' });
    await promotePlace(service, placeId, 'domner_public', { actor: 'staff:o', reason: 't' });

    expect(await getPlaceById(bob, placeId)).not.toBeNull();
  });

  it('keeps provider mappings out of a traveler\'s reach entirely', async () => {
    const service = harness.serviceClient();
    const resolved = await resolveProviderPlace(service, PROVIDER_WAT_PHO);
    const alice = harness.clientFor(ALICE);

    // A traveler who could write a mapping could claim a real provider id for a
    // place they invented, and the unique index would then refuse the genuine
    // link forever. There is no INSERT policy at all.
    const { error } = await alice.from('place_external_ids').insert({
      place_id: resolved!.place.id,
      provider: 'sandbox',
      provider_place_id: 'squatted-id',
    });
    expect(error).not.toBeNull();
    expect(await harness.rows('place_external_ids')).toHaveLength(1);
  });
});

describe('a verification level we do not recognise', () => {
  it('degrades to untrusted rather than being cast through', async () => {
    const service = harness.serviceClient();
    const resolved = await resolveProviderPlace(service, PROVIDER_WAT_PHO);
    expect(resolved!.place.verificationStatus).toBe('provider_verified');

    // A CHECK constraint means this should be impossible — which is exactly
    // where an unchecked cast turns a bad migration into a published place.
    // The constraint is dropped here to reproduce that future, because the
    // failure DIRECTION is the thing worth pinning: unknown must mean
    // untrusted, never trusted.
    await harness.execAsAdmin(`
      ALTER TABLE places DROP CONSTRAINT places_verification_status_check;
      UPDATE places SET verification_status = 'totally_legit';
    `);

    const read = await getPlaceById(service, resolved!.place.id);
    expect(read?.verificationStatus).toBe('unverified');

    await harness.execAsAdmin(`
      UPDATE places SET verification_status = 'unverified';
      ALTER TABLE places ADD CONSTRAINT places_verification_status_check
        CHECK (verification_status IN ('unverified','provider_verified','domner_public','rejected'));
    `);
  });
});

describe('the link to a traveler\'s saved copy', () => {
  it('points a destination_places row at its canonical record without changing anything else', async () => {
    const alice = harness.clientFor(ALICE);
    const service = harness.serviceClient();
    const resolution = await resolvePlaceForTraveler(alice, ALICE, WAT_PHO);

    const [saved] = await harness.asAdmin(
      `INSERT INTO destination_places (destination, name, category, lat, lng, description, created_by)
       VALUES ('Thailand', 'Wat Pho', 'spot', 13.7465, 100.4927, 'Reclining Buddha', $1)
       RETURNING id, name, category, lat`,
      [ALICE]
    );

    expect(await attachCanonicalPlace(alice, saved.id as string, resolution!.place.id)).toBe(true);

    const [after] = await harness.rows('destination_places');
    expect(after.canonical_place_id).toBe(resolution!.place.id);
    // The traveler's own copy is otherwise untouched — the itinerary still
    // reads exactly what it read before.
    expect(after.name).toBe('Wat Pho');
    expect(after.category).toBe('spot');
    expect(after.description).toBe('Reclining Buddha');

    // And a row nobody resolved keeps working with a null pointer.
    await harness.asAdmin(
      `INSERT INTO destination_places (destination, name, category, lat, lng, description, created_by)
       VALUES ('Thailand', 'Our hotel', 'stay', 13.75, 100.5, '', $1)`,
      [ALICE]
    );
    const unresolved = (await harness.rows('destination_places')).find((r) => r.name === 'Our hotel');
    expect(unresolved!.canonical_place_id).toBeNull();

    expect(await findPlaceByProviderId(service, 'sandbox', 'nothing')).toBeNull();
  });
});

describe('the backfill of the editorial catalogue', () => {
  // In production migration 013 runs against a database that ALREADY holds the
  // seeded catalogue, so its backfill is the part that matters most and the
  // part the harness cannot exercise on its own — migrations there run before
  // any seed exists. Re-applying the migration after seeding reproduces the
  // production order, and proves the migration is re-runnable while it is at it.
  const migrationPath = join(process.cwd(), 'supabase', 'migrations', '013_place_registry.sql');
  const seedPath = join(process.cwd(), 'supabase', 'seeds', 'destination_places.sql');

  it('promotes editorial rows to canonical public places and links them back', async () => {
    await harness.execAsAdmin(await readFile(seedPath, 'utf8'));
    const seeded = await harness.rows('destination_places');
    expect(seeded.length).toBeGreaterThan(0);

    await harness.execAsAdmin(await readFile(migrationPath, 'utf8'));

    const places = await harness.rows('places');
    expect(places.length).toBeGreaterThan(0);
    // Editorial content is content we wrote and already show to everyone.
    expect(places.every((row) => row.verification_status === 'domner_public')).toBe(true);
    expect(places.every((row) => row.verified_at !== null)).toBe(true);

    const linked = (await harness.rows('destination_places')).filter(
      (row) => row.canonical_place_id !== null
    );
    expect(linked.length).toBe(seeded.length);
  });

  it('does not duplicate anything when the migration is applied twice', async () => {
    await harness.execAsAdmin(await readFile(seedPath, 'utf8'));
    await harness.execAsAdmin(await readFile(migrationPath, 'utf8'));
    const first = await harness.rows('places');

    await harness.execAsAdmin(await readFile(migrationPath, 'utf8'));
    expect(await harness.rows('places')).toHaveLength(first.length);
  });

  it('leaves travelers\' own places out of the public catalogue', async () => {
    // "Our hotel" belongs to one person. Publishing it would publish their
    // notes to everybody, so the backfill takes editorial rows only.
    await harness.asAdmin(
      `INSERT INTO destination_places (destination, name, category, lat, lng, description, created_by)
       VALUES ('Thailand', 'Our hotel', 'stay', 13.75, 100.5, 'room 402', $1)`,
      [ALICE]
    );

    await harness.execAsAdmin(await readFile(migrationPath, 'utf8'));

    expect(await harness.rows('places')).toHaveLength(0);
    const [row] = await harness.rows('destination_places');
    expect(row.canonical_place_id).toBeNull();
  });
});
