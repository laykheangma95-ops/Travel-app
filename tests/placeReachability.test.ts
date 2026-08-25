// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — the /you/saved → /place/[id] seam.
//
// Phase 8 built GET /api/travel/places/:id and a page for it; nothing before
// Phase 9 ever linked to it. /you/saved is the first entry point wired to it,
// and the whole change is "use the id already in SavedPlace.placeId as the
// href" — no new endpoint, no new column. This proves that plumbing actually
// holds: the id GET /api/travel/places/saved hands back for a saved place is
// exactly the id GET /api/travel/places/:id accepts and resolves, proven
// through both real route handlers against a real Postgres (PGlite) rather
// than assumed from reading the two modules side by side.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { ApiError } from '@/lib/http';
import { promotePlace, resolveProviderPlace } from '@/lib/places/repository';
import type { ProviderPlace } from '@/lib/providers/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

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
  // Configured, but neither route may use it: every read/write goes through
  // the caller's session client so RLS applies — never the service role.
  getSupabase: () => ({}),
}));

const { GET: GET_SAVED, POST: POST_SAVED } = await import('@/app/api/travel/places/saved/route');
const { GET: GET_DETAIL } = await import('@/app/api/travel/places/[id]/route');

const SAVED_BASE = 'https://domner.test/api/travel/places/saved';
const DETAIL_BASE = 'https://domner.test/api/travel/places';

const headers = { 'x-forwarded-for': '203.0.113.7' };

const getSaved = () => GET_SAVED(new Request(SAVED_BASE, { headers }));
const postSaved = (body: unknown) =>
  POST_SAVED(
    new Request(SAVED_BASE, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
const getDetail = (id: string) =>
  GET_DETAIL(new Request(`${DETAIL_BASE}/${id}`, { headers }), { params: { id } });

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

async function publishedPlace(): Promise<string> {
  const service = harness.serviceClient();
  const resolved = await resolveProviderPlace(service, PROVIDER);
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
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await harness.close();
});

describe('/you/saved links a saved place to the exact id /place/[id] accepts', () => {
  it('round-trips a saved place through both real routes', async () => {
    const placeId = await publishedPlace();
    await postSaved({ placeId });

    const savedBody = (await (await getSaved()).json()) as {
      places: { placeId: string; name: string }[];
    };
    expect(savedBody.places).toHaveLength(1);
    expect(savedBody.places[0].placeId).toBe(placeId);

    // The href /you/saved now builds is exactly `/place/${placeId}` — this is
    // what that id resolves to when followed.
    const detailResponse = await getDetail(savedBody.places[0].placeId);
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as {
      place: { id: string };
      saved: boolean;
    };
    expect(detailBody.place.id).toBe(placeId);
    expect(detailBody.saved).toBe(true);
  });

  it('carries no submitter identity or registry ownership across the seam', async () => {
    const placeId = await publishedPlace();
    await postSaved({ placeId });

    const savedBody = await (await getSaved()).json();
    const detailBody = await (await getDetail(placeId)).json();

    // Neither response is allowed to name who submitted the place, in either
    // casing — that is exactly the private metadata Phase 9's own security
    // review says navigation must never carry.
    expect(JSON.stringify(savedBody)).not.toMatch(/created_by|createdBy|submitted_by|submittedBy/);
    expect(JSON.stringify(detailBody)).not.toMatch(/created_by|createdBy|submitted_by|submittedBy/);
  });
});
