// ─────────────────────────────────────────────────────────────────────────────
// GET/POST/DELETE /api/travel/places/saved — the full request cycle.
//
// The unit suite proves the module against real policies. This proves the
// exported handlers: that auth is required, that the wire shapes are what the
// client reads, that both writes are idempotent through HTTP as well as in SQL,
// and that a place the caller cannot see is a 404 rather than a 403.
//
// It runs against a REAL Postgres through the harness, so the route, the module
// and the policies are all the production ones.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { ApiError } from '@/lib/http';
import { promotePlace, resolveProviderPlace } from '@/lib/places/repository';
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
  // Configured, but the route must never use it: every read and write goes
  // through the caller's session client so RLS applies.
  getSupabase: () => ({}),
}));

const { GET, POST, DELETE } = await import('@/app/api/travel/places/saved/route');

const BASE = 'https://domner.test/api/travel/places/saved';

const post = (body: unknown) =>
  POST(new Request(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  }));

const del = (placeId: string) =>
  DELETE(new Request(`${BASE}?placeId=${placeId}`, {
    method: 'DELETE',
    headers: { 'x-forwarded-for': '203.0.113.7' },
  }));

const get = (query = '') =>
  GET(new Request(`${BASE}${query}`, { headers: { 'x-forwarded-for': '203.0.113.7' } }));

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

describe('POST — saving', () => {
  it('saves a place and reports whether it was already there', async () => {
    const placeId = await publishedPlace();

    const first = await post({ placeId });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ saved: true, alreadySaved: false });

    const second = await post({ placeId });
    expect(second.status).toBe(200);
    // Idempotent over HTTP too: a retried request is a success, not a 409.
    expect(await second.json()).toMatchObject({ saved: true, alreadySaved: true });

    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('refuses a body that is not a place id', async () => {
    expect((await post({ placeId: 'not-a-uuid' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    // .strict(): an unknown key means a client trying to set something that is
    // not the traveler's to set.
    expect((await post({ placeId: crypto.randomUUID(), verificationStatus: 'domner_public' })).status).toBe(400);
    // collection_id is a column, but not a field — collections do not exist yet.
    expect((await post({ placeId: crypto.randomUUID(), collectionId: crypto.randomUUID() })).status).toBe(400);
  });

  it('answers 404 for a place the caller cannot see', async () => {
    // Bob's own unverified place, which Alice has no way to know exists.
    const bobsPlace = await harness.asAdmin(
      `INSERT INTO places (slug,name,country_name,category,latitude,longitude,created_by)
       VALUES ('t:bob-secret','Bob Secret','Thailand','food',13.1,100.1,$1) RETURNING id`,
      [BOB]
    );

    const response = await post({ placeId: bobsPlace[0].id });
    // NOT_FOUND rather than FORBIDDEN, deliberately: "you may not see this" and
    // "this does not exist" must look identical, or the error becomes a way to
    // enumerate other travelers' unverified places.
    expect(response.status).toBe(404);
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('requires a signed-in traveler', async () => {
    const placeId = await publishedPlace();
    currentUser = null;
    expect((await post({ placeId })).status).toBe(401);
  });
});

describe('DELETE — unsaving', () => {
  it('removes a save and is idempotent', async () => {
    const placeId = await publishedPlace();
    await post({ placeId });

    const first = await del(placeId);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ removed: true });

    const second = await del(placeId);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ removed: false });
  });

  it('never removes the canonical place', async () => {
    const placeId = await publishedPlace();
    await post({ placeId });
    await del(placeId);

    expect(await harness.rows('places')).toHaveLength(1);
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('cannot remove another traveler\'s save', async () => {
    const placeId = await publishedPlace();
    await post({ placeId });

    currentUser = BOB;
    const response = await del(placeId);
    expect(await response.json()).toMatchObject({ removed: false });
    expect(await harness.rows('saved_places')).toHaveLength(1);
  });

  it('requires a signed-in traveler', async () => {
    currentUser = null;
    expect((await del(crypto.randomUUID())).status).toBe(401);
  });
});

describe('GET — reading the library', () => {
  it('answers whether one place is saved', async () => {
    const placeId = await publishedPlace();

    expect(await (await get(`?placeId=${placeId}`)).json()).toMatchObject({ saved: false });
    await post({ placeId });
    expect(await (await get(`?placeId=${placeId}`)).json()).toMatchObject({ saved: true });
  });

  it('returns the library and the countries in it', async () => {
    await post({ placeId: await publishedPlace() });
    await post({
      placeId: await publishedPlace({
        providerPlaceId: 'p-bund',
        name: 'The Bund',
        countryName: 'China',
        latitude: 31.2397,
        longitude: 121.4909,
      }),
    });

    const body = (await (await get()).json()) as {
      places: { name: string; countryName: string; saveCount: number }[];
      destinations: { destination: string }[];
    };

    expect(body.places).toHaveLength(2);
    expect(body.places[0]).toHaveProperty('saveCount');
    expect(body.destinations.map((entry) => entry.destination).sort()).toEqual(['China', 'Thailand']);
  });

  it('filters by destination', async () => {
    await post({ placeId: await publishedPlace() });
    await post({
      placeId: await publishedPlace({
        providerPlaceId: 'p-bund',
        name: 'The Bund',
        countryName: 'China',
        latitude: 31.2397,
        longitude: 121.4909,
      }),
    });

    const body = (await (await get('?destination=China')).json()) as {
      places: { countryName: string }[];
    };
    expect(body.places).toHaveLength(1);
    expect(body.places[0].countryName).toBe('China');
  });

  it('shows one traveler nothing of another\'s', async () => {
    const placeId = await publishedPlace();
    await post({ placeId });

    currentUser = BOB;
    const body = (await (await get()).json()) as { places: unknown[] };
    expect(body.places).toEqual([]);
  });

  it('requires a signed-in traveler', async () => {
    currentUser = null;
    expect((await get()).status).toBe(401);
  });
});
