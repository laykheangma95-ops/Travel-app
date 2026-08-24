// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 ownership boundary — the adversarial suite.
//
// Every test here performs an attack rather than describing one, and every
// assertion is about what the DATABASE did, not about what a route returned.
// The distinction matters because all three findings this suite exists for were
// the same mistake: a foreign key was trusted to provide authorization.
//
//   A foreign key proves a row EXISTS. It says nothing about who may point at
//   it. `place_id`, `source_import_id` and `collection_id` each had to learn
//   that separately.
//
// The route is exercised where a hole was reachable through it, but the route
// passing is never the evidence — the raw PostgREST-shaped call underneath it
// is. If a future change deletes every validation in the API, these tests must
// still pass.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { savePlace, getSavedPlaces, getSaveCounts, isPlaceSaved } from '@/lib/places/saved';
import { promotePlace, resolveProviderPlace } from '@/lib/places/repository';
import type { ProviderPlace } from '@/lib/providers/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const PROVIDER: ProviderPlace = {
  providerId: 'sandbox',
  providerPlaceId: 'p-wat-pho',
  name: 'Wat Pho',
  localName: null,
  countryCode: 'TH',
  countryName: 'Thailand',
  city: 'Bangkok',
  district: null,
  neighborhood: null,
  latitude: 13.7465,
  longitude: 100.4927,
  address: null,
  website: null,
  phone: null,
  priceLevel: null,
  category: 'spot',
  subcategory: null,
};

let harness: Harness;

async function publishedPlace(overrides: Partial<ProviderPlace> = {}): Promise<string> {
  const service = harness.serviceClient();
  const resolved = await resolveProviderPlace(service, { ...PROVIDER, ...overrides });
  await promotePlace(service, resolved!.place.id, 'domner_public', {
    actor: 'staff:test',
    reason: 'fixture',
  });
  return resolved!.place.id;
}

/** A place only its creator can see. The subject of most attacks below. */
async function privatePlace(owner: string, slug: string, lat = 13.3): Promise<string> {
  // Each caller gets its own coordinates. Two places with the same name in the
  // same 150m cell are ONE place to the Phase 1 identity index — correct, and
  // not the thing any test in this file is about.
  const [row] = await harness.asAdmin(
    `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
     VALUES ($1,'Private Spot','Thailand','food',$3,100.3,$2) RETURNING id`,
    [slug, owner, lat]
  );
  return row.id as string;
}

/** An import belonging to one traveler, for the provenance attacks. */
async function importFor(owner: string, hash: string): Promise<string> {
  const [row] = await harness.asAdmin(
    `INSERT INTO place_imports (user_id,url_hash,normalized_url,platform,status)
     VALUES ($1,$2,'tiktok.com/x','tiktok','ready') RETURNING id`,
    [owner, hash]
  );
  return row.id as string;
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

// ── 1. Cross-user source_import_id ──────────────────────────────────────────

describe('user A cannot attach user B\'s source_import_id', () => {
  it('is refused on INSERT, by the database', async () => {
    const placeId = await publishedPlace();
    const bobsImport = await importFor(BOB, 'b'.repeat(64));
    const alice = harness.clientFor(ALICE);

    // Exactly what a direct PostgREST call sends. No route involved.
    const { error } = await alice.from('saved_places').insert({
      user_id: ALICE,
      place_id: placeId,
      source_import_id: bobsImport,
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('is refused through the module, which is what the route calls', async () => {
    const placeId = await publishedPlace();
    const bobsImport = await importFor(BOB, 'b'.repeat(64));
    const alice = harness.clientFor(ALICE);

    // The route accepts a sourceImportId and passes it through, so this is the
    // hole as it was actually reachable: over HTTP, with a valid session.
    expect(await savePlace(alice, ALICE, placeId, { sourceImportId: bobsImport })).toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('accepts the traveler\'s own import', async () => {
    const placeId = await publishedPlace();
    const ownImport = await importFor(ALICE, 'a'.repeat(64));
    const alice = harness.clientFor(ALICE);

    expect(await savePlace(alice, ALICE, placeId, { sourceImportId: ownImport })).toEqual({
      saved: true,
      alreadySaved: false,
    });
    const [row] = await harness.rows('saved_places');
    expect(row.source_import_id).toBe(ownImport);
  });

  it('accepts no import at all', async () => {
    const placeId = await publishedPlace();
    expect(await savePlace(harness.clientFor(ALICE), ALICE, placeId)).toEqual({
      saved: true,
      alreadySaved: false,
    });
    expect((await harness.rows('saved_places'))[0].source_import_id).toBeNull();
  });

  it('cannot be attached afterwards by UPDATE, not even the traveler\'s own', async () => {
    const placeId = await publishedPlace();
    const bobsImport = await importFor(BOB, 'b'.repeat(64));
    const ownImport = await importFor(ALICE, 'a'.repeat(64));
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    await alice.from('saved_places').update({ source_import_id: bobsImport }).eq('place_id', placeId);
    expect((await harness.rows('saved_places'))[0].source_import_id).toBeNull();

    // Immutable after creation, so provenance cannot be rewritten later —
    // even to something the traveler does own.
    await alice.from('saved_places').update({ source_import_id: ownImport }).eq('place_id', placeId);
    expect((await harness.rows('saved_places'))[0].source_import_id).toBeNull();
  });
});

// ── 2. collection_id ────────────────────────────────────────────────────────

describe('collection_id cannot be populated during Phase 2', () => {
  it('refuses an arbitrary value on INSERT', async () => {
    const placeId = await publishedPlace();
    const { error } = await harness.clientFor(ALICE).from('saved_places').insert({
      user_id: ALICE,
      place_id: placeId,
      collection_id: '99999999-9999-4999-8999-999999999999',
    });

    // A CHECK constraint, so it is refused for the service role too — there is
    // no collections table for a value to be valid against yet.
    expect(error).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('refuses it on UPDATE', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    await alice
      .from('saved_places')
      .update({ collection_id: '99999999-9999-4999-8999-999999999999' })
      .eq('place_id', placeId);

    expect((await harness.rows('saved_places'))[0].collection_id).toBeNull();
  });

  it('refuses it even to the service role', async () => {
    const placeId = await publishedPlace();
    const { error } = await harness.serviceClient().from('saved_places').insert({
      user_id: ALICE,
      place_id: placeId,
      collection_id: '99999999-9999-4999-8999-999999999999',
    });
    expect(String(error?.message)).toContain('saved_places_collection_null');
  });
});

// ── 3. Private-place statistics ─────────────────────────────────────────────

describe('private-place statistics cannot leak', () => {
  it('hides the count of a place the caller cannot see', async () => {
    const secret = await privatePlace(BOB, 't:bob-secret');
    await savePlace(harness.clientFor(BOB), BOB, secret);

    const alice = harness.clientFor(ALICE);
    const { data } = await alice.from('place_stats').select('place_id,save_count').eq('place_id', secret);
    expect(data ?? []).toHaveLength(0);
    expect((await getSaveCounts(alice, [secret])).size).toBe(0);
  });

  it('does not enumerate places through the stats table, in production order', async () => {
    // PRODUCTION ORDERING, which the ordinary harness never reproduces: there,
    // migrations run against an empty database, so the backfill at the bottom
    // of 014 inserts nothing. In production 014 runs AFTER 013 has created
    // places, so it inserts a stats row for every one of them — which is what
    // made enumeration possible. Re-applying the migration here reproduces
    // exactly that.
    const publicPlace = await publishedPlace();
    const bobsSecret = await privatePlace(BOB, 't:bob-secret');
    const alicesOwn = await privatePlace(ALICE, 't:alice-own', 13.4);

    await harness.execAsAdmin(
      await readFile(join(process.cwd(), 'supabase', 'migrations', '014_saved_place_library.sql'), 'utf8')
    );

    // The backfill really did cover every place, including the private ones.
    expect(await harness.rows('place_stats')).toHaveLength(3);

    const alice = harness.clientFor(ALICE);
    const { data } = await alice.from('place_stats').select('place_id');
    const visible = (data ?? []).map((row) => (row as { place_id: string }).place_id).sort();

    // Alice sees the published place and her own. Bob's private place is not
    // in the list — its existence is not hers to learn.
    expect(visible).toEqual([publicPlace, alicesOwn].sort());
    expect(visible).not.toContain(bobsSecret);
  });

  it('still shows counts for published places, and never who saved them', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);
    await savePlace(harness.clientFor(BOB), BOB, placeId);

    // Bob reads the aggregate — the feature still works.
    const counts = await getSaveCounts(harness.clientFor(BOB), [placeId]);
    expect(counts.get(placeId)).toBe(2);

    // …and the aggregate leads nowhere: Bob sees his own save row and no other,
    // so the 2 he can read as a number is not resolvable into two people.
    const { data } = await harness.clientFor(BOB).from('saved_places').select('user_id');
    expect(data ?? []).toHaveLength(1);
    expect((data ?? []).every((row) => (row as { user_id: string }).user_id === BOB)).toBe(true);
  });

  it('is closed to anonymous callers entirely', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);

    // The `anon` role, as PostgREST uses it for a signed-out request. Raised as
    // an exception so a leak fails the test rather than printing a number
    // nobody reads.
    await expect(
      harness.execAsAdmin(`
        DO $$
        DECLARE stats INT; saves INT; detailed INT;
        BEGIN
          PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
          SET LOCAL ROLE anon;
          SELECT count(*) INTO stats    FROM place_stats;
          SELECT count(*) INTO saves    FROM saved_places;
          SELECT count(*) INTO detailed FROM saved_places_detailed;
          RESET ROLE;
          IF stats <> 0 OR saves <> 0 OR detailed <> 0 THEN
            RAISE EXCEPTION 'anon leak: place_stats=% saved_places=% view=%', stats, saves, detailed;
          END IF;
        END $$;`)
    ).resolves.toBeUndefined();
  });
});

// ── 4. Cross-user library access ────────────────────────────────────────────

describe('user A cannot reach user B\'s library', () => {
  it('cannot read it, through the table or the view', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(BOB), BOB, placeId);

    const alice = harness.clientFor(ALICE);
    expect(await getSavedPlaces(alice, ALICE)).toEqual([]);
    // Asking for Bob's rows explicitly, which is what an attacker would do.
    const { data: rows } = await alice.from('saved_places').select('id,user_id').eq('user_id', BOB);
    expect(rows ?? []).toHaveLength(0);
    const { data: view } = await alice.from('saved_places_detailed').select('saved_id').eq('user_id', BOB);
    expect(view ?? []).toHaveLength(0);
    // And cannot even learn whether Bob saved it.
    expect(await isPlaceSaved(alice, BOB, placeId)).toBe(false);
  });

  it('cannot modify it', async () => {
    const placeId = await publishedPlace();
    const other = await publishedPlace({
      providerPlaceId: 'p-jodd',
      name: 'Jodd Fairs',
      latitude: 13.7563,
      longitude: 100.5665,
    });
    await savePlace(harness.clientFor(BOB), BOB, placeId);
    const [before] = await harness.rows('saved_places');

    const alice = harness.clientFor(ALICE);
    await alice.from('saved_places').update({ place_id: other }).eq('user_id', BOB);
    await alice.from('saved_places').update({ user_id: ALICE }).eq('user_id', BOB);
    await alice.from('saved_places').update({ saved_at: '2020-01-01' }).eq('id', before.id as string);

    const [after] = await harness.rows('saved_places');
    expect(after.user_id).toBe(BOB);
    expect(after.place_id).toBe(placeId);
    expect(after.saved_at).toEqual(before.saved_at);
  });

  it('cannot delete it', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(BOB), BOB, placeId);
    const [row] = await harness.rows('saved_places');

    const alice = harness.clientFor(ALICE);
    await alice.from('saved_places').delete().eq('user_id', BOB);
    await alice.from('saved_places').delete().eq('id', row.id as string);

    expect(await harness.rows('saved_places')).toHaveLength(1);
    // And the count Bob's save contributes is untouched.
    expect((await harness.rows('place_stats'))[0].save_count).toBe(1);
  });

  it('cannot save on B\'s behalf', async () => {
    const placeId = await publishedPlace();
    const { error } = await harness
      .clientFor(ALICE)
      .from('saved_places')
      .insert({ user_id: BOB, place_id: placeId });

    expect(error).not.toBeNull();
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });
});

// ── 5. Duplicates ───────────────────────────────────────────────────────────

describe('duplicate and simultaneous saves cannot create duplicate records', () => {
  it('refuses the second row at the database, whoever asks', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);
    await savePlace(alice, ALICE, placeId);

    const { error } = await alice.from('saved_places').insert({ user_id: ALICE, place_id: placeId });
    expect(error?.code).toBe('23505');

    // The service role cannot force one either: a unique index is not a policy.
    const { error: serviceError } = await harness
      .serviceClient()
      .from('saved_places')
      .insert({ user_id: ALICE, place_id: placeId });
    expect(serviceError?.code).toBe('23505');

    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('collapses a burst of simultaneous saves to one row and one count', async () => {
    // NOTE ON WHAT THIS PROVES: the harness holds a single connection, so these
    // interleave rather than running in true parallel. The guarantee is the
    // unique index, which the test above exercises directly; this checks that
    // the module's conflict handling turns the losers into successes rather
    // than errors, which is what makes the button idempotent.
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => savePlace(alice, ALICE, placeId))
    );

    expect(results.every((result) => result?.saved)).toBe(true);
    expect(results.filter((result) => result?.alreadySaved === false)).toHaveLength(1);
    expect(await harness.rows('saved_places')).toHaveLength(1);
    expect((await harness.rows('place_stats'))[0].save_count).toBe(1);
  });
});

// ── 6. Deleting a user ──────────────────────────────────────────────────────

describe('deleting a traveler', () => {
  it('takes their library with them and leaves the counters correct', async () => {
    const placeId = await publishedPlace();
    await savePlace(harness.clientFor(ALICE), ALICE, placeId);
    await savePlace(harness.clientFor(BOB), BOB, placeId);
    expect((await harness.rows('place_stats'))[0].save_count).toBe(2);

    await harness.asAdmin(`DELETE FROM auth.users WHERE id = $1`, [ALICE]);

    // ON DELETE CASCADE removes the save, and the AFTER DELETE trigger fires on
    // a cascade exactly as it does on a direct delete.
    expect(await harness.rows('saved_places')).toHaveLength(1);
    expect((await harness.rows('place_stats'))[0].save_count).toBe(1);
    // The canonical place is untouched by a person leaving.
    expect(await harness.rows('places')).toHaveLength(1);
  });
});
