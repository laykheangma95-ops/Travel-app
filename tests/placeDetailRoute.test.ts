// ─────────────────────────────────────────────────────────────────────────────
// GET /api/travel/places/:id — the place-detail page's only data source.
//
// Phase 8's whole security argument is one sentence: this route answers "found"
// or "not found" and nothing in between, decided entirely by
// `places_read_public_or_own` on the caller's own session client. These tests
// perform the attacks that sentence has to survive rather than describing them
// — a private place read by its stranger, a save count read for a place the
// caller cannot see, a malformed or nonexistent id — and assert what the ROUTE
// returned, against a REAL Postgres running the REAL policies (PGlite).
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { ApiError } from '@/lib/http';
import { promotePlace, resolveProviderPlace } from '@/lib/places/repository';
import { savePlace } from '@/lib/places/saved';
import type { ProviderPlace } from '@/lib/providers/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let harness: Harness;
/** Who the mocked auth layer says is calling, and with which client. */
let currentUser: string | null = ALICE;

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!currentUser) throw new ApiError('UNAUTHORIZED', 'Please sign in.');
    return { id: currentUser };
  },
  supabaseFromRequest: () => (currentUser ? harness.clientFor(currentUser) : null),
}));

vi.mock('@/lib/supabase', () => ({
  // Configured, but the route must never use it: every read goes through the
  // caller's session client so RLS applies — never the service role.
  getSupabase: () => ({}),
}));

const { GET } = await import('@/app/api/travel/places/[id]/route');

const BASE = 'https://domner.test/api/travel/places';

const get = (id: string) =>
  GET(new Request(`${BASE}/${id}`, { headers: { 'x-forwarded-for': '203.0.113.7' } }), {
    params: { id },
  });

const PROVIDER: ProviderPlace = {
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
  website: 'https://www.watpho.com',
  phone: null,
  priceLevel: null,
  category: 'spot',
  subcategory: null,
};

async function publishedPlace(overrides: Partial<ProviderPlace> = {}): Promise<string> {
  const service = harness.serviceClient();
  const resolved = await resolveProviderPlace(service, { ...PROVIDER, ...overrides });
  await promotePlace(service, resolved!.place.id, 'domner_public', {
    actor: 'staff:test',
    reason: 'fixture',
  });
  return resolved!.place.id;
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  currentUser = ALICE;
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await harness.close();
});

describe('visibility', () => {
  it('reads a published place, with a save count and no submitter identity', async () => {
    const placeId = await publishedPlace();

    const response = await get(placeId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      place: { id: placeId, name: 'Wat Pho', localName: 'วัดโพธิ์', countryName: 'Thailand' },
      saved: false,
      saveCount: 0,
    });
    // createdBy is server-internal (the audit trail for promotePlace); a
    // published place can have started as anyone's import, and handing that
    // id to every other signed-in traveler who opens the page would link an
    // account to a place for no reason the page needs.
    expect(body.place).not.toHaveProperty('createdBy');
  });

  it('lets the owner read their own unverified place', async () => {
    const placeId = await harness.asAdmin(
      `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
       VALUES ('t:alice-idea','Alice Idea','Thailand','food',13.1,100.1,$1) RETURNING id`,
      [ALICE]
    ).then((rows) => rows[0].id as string);

    const response = await get(placeId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      place: { id: placeId, verificationStatus: 'unverified' },
    });
  });

  it('answers 404 — not 403 — for another traveler\'s unverified place', async () => {
    const bobsPlace = await harness
      .asAdmin(
        `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
         VALUES ('t:bob-secret','Bob Secret','Thailand','food',13.1,100.1,$1) RETURNING id`,
        [BOB]
      )
      .then((rows) => rows[0].id as string);

    // Alice is calling.
    const response = await get(bobsPlace);
    expect(response.status).toBe(404);
    const body = await response.json();
    // The response must not distinguish "forbidden" from "does not exist" in
    // its shape either — a differently-shaped 404 would itself be the leak.
    expect(body.error).toBeDefined();
    expect(body.place).toBeUndefined();
  });

  it('answers 404 for an id that does not exist at all, identically shaped', async () => {
    const missing = await get(crypto.randomUUID());
    const forged = await get(
      (await harness
        .asAdmin(
          `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
           VALUES ('t:bob-secret-2','Bob Secret 2','Thailand','food',13.1,100.1,$1) RETURNING id`,
          [BOB]
        )
        .then((rows) => rows[0].id as string))
    );

    expect(missing.status).toBe(404);
    expect(forged.status).toBe(404);
    // requestId is per-request by design (lib/http.ts) and is not part of the
    // shape being asserted here — the error code, message and absence of a
    // `place` key must be identical regardless of which kind of "not found"
    // this actually was.
    const [missingBody, forgedBody] = await Promise.all([missing.json(), forged.json()]);
    expect(missingBody.error).toEqual(forgedBody.error);
    expect(missingBody.place).toBeUndefined();
    expect(forgedBody.place).toBeUndefined();
  });

  it('answers 404 rather than 400 for a malformed id, so the shape of the failure never varies', async () => {
    const response = await get('not-a-uuid');
    expect(response.status).toBe(404);
  });

  it('requires a signed-in traveler', async () => {
    const placeId = await publishedPlace();
    currentUser = null;
    expect((await get(placeId)).status).toBe(401);
  });
});

describe('save state and counts', () => {
  it('reflects whether the caller has saved the place', async () => {
    const placeId = await publishedPlace();

    expect(await (await get(placeId)).json()).toMatchObject({ saved: false });

    await savePlace(harness.clientFor(ALICE), ALICE, placeId);
    expect(await (await get(placeId)).json()).toMatchObject({ saved: true });
  });

  it('matches place_stats exactly as more travelers save', async () => {
    const placeId = await publishedPlace();

    await savePlace(harness.clientFor(ALICE), ALICE, placeId);
    await savePlace(harness.clientFor(BOB), BOB, placeId);

    const body = await (await get(placeId)).json();
    expect(body.saveCount).toBe(2);

    const stats = await harness.rows('place_stats');
    const row = (stats as { place_id: string; save_count: number }[]).find(
      (entry) => entry.place_id === placeId
    );
    expect(row?.save_count).toBe(2);
  });

  it('never duplicates a save on a repeated request, and unsaving preserves the place', async () => {
    const placeId = await publishedPlace();
    const alice = harness.clientFor(ALICE);

    await savePlace(alice, ALICE, placeId);
    await savePlace(alice, ALICE, placeId);
    expect(await harness.rows('saved_places')).toHaveLength(1);

    await alice.from('saved_places').delete().eq('user_id', ALICE).eq('place_id', placeId);

    // The canonical place survives unsaving — ON DELETE RESTRICT, and no
    // DELETE policy on `places` at all.
    const response = await get(placeId);
    expect(response.status).toBe(200);
    expect((await response.json()).saveCount).toBe(0);
    expect(await harness.rows('places')).toHaveLength(1);
  });

  it('cannot be reached via a forged canonical_place_id pointer, even though the FK allows the write', async () => {
    // The Phase 7 review's open item: destination_places_update_own has no
    // column-level restriction, so a traveler can PATCH their own
    // destination_places row and set canonical_place_id to ANY existing
    // places.id — the foreign key only proves the row exists, not that the
    // writer may see it. This proves that pointer buys an attacker nothing
    // against this route: visibility is re-derived from `places` RLS on every
    // request, never inherited from how the id was obtained.
    const bobsPlace = await harness
      .asAdmin(
        `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
         VALUES ('t:bob-secret-4','Bob Secret 4','Thailand','food',13.1,100.1,$1) RETURNING id`,
        [BOB]
      )
      .then((rows) => rows[0].id as string);

    // Alice owns a destination_places row and points it at Bob's private
    // place, exactly as a direct PostgREST call could — this is the FK
    // succeeding, not a bug in this test.
    const alice = harness.clientFor(ALICE);
    const destRow = await harness
      .asAdmin(
        `INSERT INTO destination_places (destination,name,category,lat,lng,description,created_by)
         VALUES ('Thailand','Alices Idea','food',13.2,100.2,'',$1) RETURNING id`,
        [ALICE]
      )
      .then((rows) => rows[0].id as string);
    const { error } = await alice
      .from('destination_places')
      .update({ canonical_place_id: bobsPlace })
      .eq('id', destRow);
    expect(error).toBeNull();

    // The pointer now exists. The route must still refuse it.
    const response = await get(bobsPlace);
    expect(response.status).toBe(404);
  });

  it('never leaks a private place\'s save count to a stranger', async () => {
    const bobsPlace = await harness
      .asAdmin(
        `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
         VALUES ('t:bob-secret-3','Bob Secret 3','Thailand','food',13.1,100.1,$1) RETURNING id`,
        [BOB]
      )
      .then((rows) => rows[0].id as string);
    await savePlace(harness.clientFor(BOB), BOB, bobsPlace);

    // Alice cannot even learn the place exists, let alone that it has a save.
    const response = await get(bobsPlace);
    expect(response.status).toBe(404);
  });
});
