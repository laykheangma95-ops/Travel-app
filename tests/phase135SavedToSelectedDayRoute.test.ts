// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 MEDIUM-4 remediation — "Saved → selected day", proven at the
// route level with real Postgres and real RLS.
//
// components/travel/ItineraryEditor.tsx's `addFromLibrary` (a client
// function this repo's Vitest config cannot mount — no JSX/TSX transform,
// same constraint tests/phase135SavedTabLifecycle.test.ts's header explains)
// performs exactly two real HTTP calls in sequence when a specific day is
// selected: POST /api/travel/places/:id/add-to-trip, then PATCH the
// itinerary with action 'move' onto that day. This file drives that EXACT
// sequence through the real, exported route handlers — same harness pattern
// tests/itineraryRoute.test.ts and tests/phase135AddCustomRoute.test.ts
// already use — so what it proves is the backend contract the client wiring
// depends on: the two-call sequence actually lands the place on the selected
// day, leaves the rest of the trip untouched, and stays idempotent.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '' }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: session.userId }),
  supabaseFromRequest: () => session.client,
}));

const { PATCH } = await import('@/app/api/travel/itinerary/[tripId]/route');
const { POST: addToTrip } = await import('@/app/api/travel/places/[id]/add-to-trip/route');

let harness: Harness;

function patch(tripId: string, body: unknown) {
  const request = new Request(`https://domner.test/api/travel/itinerary/${tripId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: { tripId } });
}

function postAddToTrip(placeId: string, tripId: string) {
  const request = new Request(`https://domner.test/api/travel/places/${placeId}/add-to-trip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ tripId }),
  });
  return addToTrip(request, { params: { id: placeId } });
}

function signIn(userId: string) {
  session.userId = userId;
  session.client = harness.clientFor(userId);
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  signIn(ALICE);
});

afterAll(async () => {
  await harness.close();
});

/** A published canonical place — visible to any signed-in traveler under RLS. */
async function seedCanonicalPlace(name = 'Wat Pho') {
  const service = harness.serviceClient();
  const { data } = await service
    .from('places')
    .insert({
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      country_name: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'domner_public',
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

async function seedTripWithTwoDays() {
  const [tripRow] = await harness.asAdmin(
    `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Thailand trip','Thailand') RETURNING id`,
    [ALICE]
  );
  const tripId = tripRow.id as string;
  const [thuRow] = await harness.asAdmin(
    `INSERT INTO itinerary_days (trip_id, day_index, date) VALUES ($1, 1, '2026-08-27') RETURNING id`,
    [tripId]
  );
  const [friRow] = await harness.asAdmin(
    `INSERT INTO itinerary_days (trip_id, day_index, date) VALUES ($1, 2, '2026-08-28') RETURNING id`,
    [tripId]
  );
  return { tripId, thuId: thuRow.id as string, friId: friRow.id as string };
}

describe('Saved (global library) → a specific selected day', () => {
  it('P is added to Thu, not merely filed into Ideas, and Fri is unchanged', async () => {
    const { tripId, thuId, friId } = await seedTripWithTwoDays();
    const placeId = await seedCanonicalPlace('Wat Pho');

    // Step 1 — the real add-to-trip call `addFromLibrary` makes.
    const addResponse = await postAddToTrip(placeId, tripId);
    expect(addResponse.status).toBe(200);
    const addBody = await addResponse.json();
    expect(addBody.status).toBe('added');
    expect(addBody.alreadyAdded).toBe(false);

    // It lands in Ideas first — addPlaceToTrip's only destination.
    const afterAdd = await harness.rows('itinerary_places');
    const ideaRow = afterAdd.find((row) => row.itinerary_day_id !== thuId && row.itinerary_day_id !== friId);
    expect(ideaRow).toBeTruthy();

    // Step 2 — the real move call `addFromLibrary` makes when a day is
    // selected, exactly as components/travel/ItineraryEditor.tsx issues it.
    const moveResponse = await patch(tripId, { action: 'move', dayId: thuId, placeId: ideaRow!.id as string });
    expect(moveResponse.status).toBe(200);

    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(1);
    expect(rows[0].itinerary_day_id).toBe(thuId);

    // Fri remains untouched — zero rows, never touched by this sequence.
    const friRows = rows.filter((row) => row.itinerary_day_id === friId);
    expect(friRows).toHaveLength(0);

    // The library is untouched by any of this.
    expect(await harness.rows('saved_places')).toHaveLength(0);
  });

  it('duplicate add remains idempotent: a second add-to-trip for the same place does not create a second row, and does not move the first', async () => {
    const { tripId, thuId } = await seedTripWithTwoDays();
    const placeId = await seedCanonicalPlace('Wat Pho');

    const first = await postAddToTrip(placeId, tripId);
    expect((await first.json()).alreadyAdded).toBe(false);

    const beforeMoveRows = await harness.rows('itinerary_places');
    const ideaRow = beforeMoveRows[0];
    await patch(tripId, { action: 'move', dayId: thuId, placeId: ideaRow.id as string });

    // Traveler taps the same saved place again (from Thu's picker again).
    const second = await postAddToTrip(placeId, tripId);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.status).toBe('added');
    expect(secondBody.alreadyAdded).toBe(true);

    // Still exactly one row, still on Thu — a duplicate add is a safe no-op,
    // and (per addFromLibrary's own alreadyAdded guard) is never relocated.
    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(1);
    expect(rows[0].itinerary_day_id).toBe(thuId);
  });

  it('Ideas context: no day selected, the place stays in Ideas (not moved anywhere)', async () => {
    const { tripId } = await seedTripWithTwoDays();
    const placeId = await seedCanonicalPlace('Wat Pho');

    const response = await postAddToTrip(placeId, tripId);
    expect((await response.json()).alreadyAdded).toBe(false);

    // No move call — this is what addFromLibrary does when tab === 'ideas'.
    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(1);
    const day = await harness.asAdmin(`SELECT day_index FROM itinerary_days WHERE id = $1`, [
      rows[0].itinerary_day_id,
    ]);
    expect(day[0].day_index).toBe(0); // the Ideas day
  });
});
