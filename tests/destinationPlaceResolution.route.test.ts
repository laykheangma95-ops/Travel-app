// ─────────────────────────────────────────────────────────────────────────────
// POST /api/travel/destination-places/:id/resolution — Phase 13.
//
// Same shape as tests/addPlaceToTrip.test.ts: the exported handler, driven
// with a session client backed by real Postgres and real RLS, adversarial
// cases performed rather than just described. What this route's whole job is
// — apply a confirm/reject/correct decision without ever trusting the client
// for anything beyond "which of the three" — is exactly what these tests
// attack.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '', signedIn: true }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({}),
}));

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!session.signedIn) {
      const { ApiError } = await import('@/lib/http');
      throw new ApiError('UNAUTHORIZED', 'Sign in to confirm that place.');
    }
    return { id: session.userId };
  },
  supabaseFromRequest: () => session.client,
}));

const { POST } = await import('@/app/api/travel/destination-places/[id]/resolution/route');

let harness: Harness;

function post(destinationPlaceId: string, body: unknown) {
  return POST(
    new Request(`https://domner.test/api/travel/destination-places/${destinationPlaceId}/resolution`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.60' },
      body: JSON.stringify(body),
    }),
    { params: { id: destinationPlaceId } }
  );
}

function signIn(userId: string) {
  session.signedIn = true;
  session.userId = userId;
  session.client = harness.clientFor(userId);
}

/** Two branches of one café, ~100m apart, both published — the same fixture
 *  tests/resolvePlaceForTraveler.ambiguity.test.ts uses. */
async function seedTwoBranches(): Promise<{ a: string; b: string }> {
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

/** A traveler's own unresolved destination_places row sitting exactly on
 *  branch A's coordinates — the ambiguous case, unlinked, ready to confirm. */
async function ownDestinationPlace(userId: string): Promise<string> {
  const client = harness.clientFor(userId);
  const { data } = await client
    .from('destination_places')
    .insert({
      destination: 'Thailand',
      name: 'Blue Cafe',
      category: 'food',
      description: '',
      lat: 13.7465,
      lng: 100.4927,
      created_by: userId,
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  signIn(ALICE);
});

afterAll(async () => {
  await harness.close();
});

describe('confirming a proposal', () => {
  it('attaches the proposed canonical place and records feedback', async () => {
    const { a } = await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    const response = await post(dpId, { decision: 'confirmed' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: 'applied', canonicalPlaceId: a });

    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dpId)?.canonical_place_id).toBe(a);

    const feedback = await harness.rows('place_resolution_feedback');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({
      user_id: ALICE,
      destination_place_id: dpId,
      decision: 'confirmed',
      proposed_place_id: a,
      corrected_place_id: null,
      resolver_version: 'resolution-v1',
    });
  });
});

describe('rejecting a proposal', () => {
  it('leaves canonical_place_id null and the trip place untouched', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    const response = await post(dpId, { decision: 'rejected' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: 'applied', canonicalPlaceId: null });

    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dpId)?.canonical_place_id).toBeNull();

    const feedback = await harness.rows('place_resolution_feedback');
    expect(feedback[0]).toMatchObject({ decision: 'rejected', corrected_place_id: null });
  });
});

describe('correcting to the other candidate', () => {
  it('applies the selected alternative, never the original proposal', async () => {
    const { a, b } = await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    const response = await post(dpId, { decision: 'corrected', correctedPlaceId: b });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: 'applied', canonicalPlaceId: b });
    expect(body.canonicalPlaceId).not.toBe(a);

    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dpId)?.canonical_place_id).toBe(b);
  });

  it('refuses a correction naming a place that is not one of the offered alternatives', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    // A real, visible, but entirely unrelated published place.
    const service = harness.serviceClient();
    const { data: unrelated } = await service
      .from('places')
      .insert({
        slug: 'unrelated-place',
        name: 'Unrelated Place',
        country_name: 'Thailand',
        latitude: 20,
        longitude: 105,
        verification_status: 'domner_public',
      })
      .select('id')
      .single();

    const response = await post(dpId, {
      decision: 'corrected',
      correctedPlaceId: (unrelated as { id: string }).id,
    });
    expect(response.status).toBe(400);

    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dpId)?.canonical_place_id).toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('refuses "corrected" with no correctedPlaceId at the wire boundary', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    const response = await post(dpId, { decision: 'corrected' });
    expect(response.status).toBe(400);
  });
});

describe('authorization', () => {
  it('a signed-out caller gets 401', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);
    session.signedIn = false;

    const response = await post(dpId, { decision: 'confirmed' });
    expect(response.status).toBe(401);
  });

  it('a foreign destination_places id reads as NOT_FOUND, not another traveler\'s data', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);
    signIn(BOB);

    const response = await post(dpId, { decision: 'confirmed' });
    expect(response.status).toBe(404);

    const rows = await harness.rows('destination_places');
    expect(rows.find((r) => r.id === dpId)?.canonical_place_id).toBeNull();
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });

  it('a malformed id is refused the same way as an invisible one', async () => {
    const response = await post('not-a-uuid', { decision: 'confirmed' });
    expect(response.status).toBe(404);
  });

  it('extra body keys are rejected', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    const response = await post(dpId, { decision: 'confirmed', userId: BOB });
    expect(response.status).toBe(400);
  });
});

describe('when the registry has moved on', () => {
  it('a place with nothing ambiguous about it any more reports no-proposal rather than applying a stale decision', async () => {
    // No branches seeded at all — there is nothing nearby to propose.
    const dpId = await ownDestinationPlace(ALICE);

    const response = await post(dpId, { decision: 'confirmed' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: 'no-proposal', canonicalPlaceId: null });

    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });
});

describe('verification_status is never touched', () => {
  it('confirming a proposal does not promote the canonical place', async () => {
    const { a } = await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    await post(dpId, { decision: 'confirmed' });

    const places = await harness.rows('places');
    expect(places.find((p) => p.id === a)?.verification_status).toBe('domner_public');
    // (Already domner_public in this fixture — the real assertion is in the
    // unverified-place test below, where promotion would be visible if it
    // happened.)
  });

  it('confirming an UNVERIFIED proposal leaves it unverified', async () => {
    const service = harness.serviceClient();
    const { data } = await service
      .from('places')
      .insert({
        slug: 'alice-own-guess',
        name: 'Alice Own Guess',
        country_name: 'Thailand',
        latitude: 13.7465,
        longitude: 100.4927,
        verification_status: 'unverified',
        created_by: ALICE,
      })
      .select('id')
      .single();
    const placeId = (data as { id: string }).id;

    // A second same-name row within range, still Alice's own, so both are
    // visible to her and the match is genuinely ambiguous.
    await service.from('places').insert({
      slug: 'alice-own-guess-2',
      name: 'Alice Own Guess',
      country_name: 'Thailand',
      latitude: 13.7474,
      longitude: 100.4927,
      verification_status: 'unverified',
      created_by: ALICE,
    });

    const client = harness.clientFor(ALICE);
    const { data: dp } = await client
      .from('destination_places')
      .insert({
        destination: 'Thailand',
        name: 'Alice Own Guess',
        category: 'food',
        description: '',
        lat: 13.7465,
        lng: 100.4927,
        created_by: ALICE,
      })
      .select('id')
      .single();

    const response = await post((dp as { id: string }).id, { decision: 'confirmed' });
    expect(response.status).toBe(200);

    const places = await harness.rows('places');
    expect(places.find((p) => p.id === placeId)?.verification_status).toBe('unverified');
  });
});

describe('idempotency', () => {
  it('a double submission updates the one standing decision rather than creating two', async () => {
    await seedTwoBranches();
    const dpId = await ownDestinationPlace(ALICE);

    await post(dpId, { decision: 'rejected' });
    await post(dpId, { decision: 'confirmed' });

    const feedback = await harness.rows('place_resolution_feedback');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({ decision: 'confirmed' });
  });
});
