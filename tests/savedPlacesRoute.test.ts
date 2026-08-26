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

/** An import belonging to one traveler, for the provenance tests. Same shape
 *  as tests/savedPlaces.security.test.ts's own `importFor`. */
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

// Phase 12 — hearting a place from the import "saved" screen sends
// sourceImportId over this exact route, so this is the path SavedPlaceButton
// actually takes rather than a re-statement of the module-level contract
// tests/savedPlaces.security.test.ts already proves (which this does not
// duplicate — that suite is the adversarial one, this is the HTTP one).
describe('POST — saving with provenance', () => {
  it('persists sourceImportId when it names the caller\'s own import', async () => {
    const placeId = await publishedPlace();
    const ownImport = await importFor(ALICE, 'a'.repeat(64));

    const response = await post({ placeId, sourceImportId: ownImport });
    expect(response.status).toBe(200);

    const [row] = await harness.rows('saved_places');
    expect(row.source_import_id).toBe(ownImport);
  });

  it('still saves, with no provenance, when sourceImportId is omitted', async () => {
    const placeId = await publishedPlace();

    expect((await post({ placeId })).status).toBe(200);

    const [row] = await harness.rows('saved_places');
    expect(row.source_import_id).toBeNull();
  });

  it('refuses another traveler\'s import id, and writes nothing', async () => {
    const placeId = await publishedPlace();
    const bobsImport = await importFor(BOB, 'b'.repeat(64));

    const response = await post({ placeId, sourceImportId: bobsImport });
    // Same NOT_FOUND shape as a place the caller cannot see — a save that
    // succeeds for one id and fails for another is an oracle, whichever
    // column is being probed.
    expect(response.status).toBe(404);
    expect(await harness.rows('saved_places')).toHaveLength(0);
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

  // Phase 12 — the 50-row ceiling (BREAK-4 in the readiness report): before
  // this phase, GET never read `offset` at all, so save #51 was permanently
  // unreachable, and getSavedDestinations tallied only the first 50 rows, so
  // a country whose only save landed past row 50 vanished from the filter
  // entirely rather than merely being undercounted.
  describe('paging past the first page', () => {
    async function seedFiftyOne(): Promise<{ ids: string[]; vietnamId: string }> {
      const ids: string[] = [];
      // 50 Thailand places, spread far enough apart (0.1 degrees, ~11km) that
      // none collide on the registry's name+geohash identity index.
      for (let i = 0; i < 50; i++) {
        // tripWrite is capped at 30/min (lib/rateLimit.ts) — real protection
        // against a traveler hammering the save button, not something this
        // fixture's bulk seeding should trip. Reset periodically rather than
        // disabling the limiter, so it stays exercised by every other test.
        if (i % 25 === 0) __resetRateLimits();
        const placeId = await publishedPlace({
          providerPlaceId: `p-th-${i}`,
          name: `Place ${i}`,
          latitude: 10 + i * 0.1,
          longitude: 100 + i * 0.1,
        });
        ids.push(placeId);
        expect((await post({ placeId })).status).toBe(200);
      }
      __resetRateLimits();
      // The 51st save, and the only one in a second country — the row that
      // the pre-Phase-12 50-row tally would have silently dropped.
      const vietnamId = await publishedPlace({
        providerPlaceId: 'p-vn-1',
        name: 'Hanoi Old Quarter',
        countryName: 'Vietnam',
        latitude: 21.0285,
        longitude: 105.8542,
      });
      ids.push(vietnamId);
      expect((await post({ placeId: vietnamId })).status).toBe(200);

      return { ids, vietnamId };
    }

    it('reaches every saved place through limit/offset, with no duplicates', async () => {
      const { ids } = await seedFiftyOne();

      const collected: string[] = [];
      const seen = new Set<string>();
      let offset = 0;
      const pageSize = 20;
      // A generous iteration cap so a pagination bug (e.g. offset never
      // advancing) fails the test instead of hanging it.
      for (let guard = 0; guard < 20; guard++) {
        const body = (await (await get(`?limit=${pageSize}&offset=${offset}`)).json()) as {
          places: { placeId: string }[];
        };
        if (body.places.length === 0) break;
        for (const row of body.places) {
          expect(seen.has(row.placeId)).toBe(false); // no duplicate cards
          seen.add(row.placeId);
          collected.push(row.placeId);
        }
        offset += body.places.length;
      }

      expect(collected).toHaveLength(51);
      expect(new Set(collected)).toEqual(new Set(ids));
    });

    it('clamps a negative offset to the start rather than erroring', async () => {
      await seedFiftyOne();
      const body = (await (await get('?limit=5&offset=-10')).json()) as { places: unknown[] };
      expect(body.places).toHaveLength(5);
    });

    it('answers an empty page, not an error, once every save has been read', async () => {
      await seedFiftyOne();
      const body = (await (await get('?limit=20&offset=200')).json()) as { places: unknown[] };
      expect(body.places).toEqual([]);
    });

    it('never truncates the destination filter to the first page', async () => {
      const { vietnamId } = await seedFiftyOne();
      void vietnamId;

      const body = (await (await get('?limit=1')).json()) as {
        destinations: { destination: string; count: number }[];
      };
      const byName = new Map(body.destinations.map((d) => [d.destination, d.count]));
      expect(byName.get('Thailand')).toBe(50);
      // The one place that would have fallen off a 50-row tally.
      expect(byName.get('Vietnam')).toBe(1);
    });
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
