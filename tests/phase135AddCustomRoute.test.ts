// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 — O: "Add it" actually persists, and the response the traveler
// sees is the refreshed itinerary snapshot, not a page that must be reloaded
// to find out whether the save worked. Same route-level harness pattern as
// tests/itineraryRoute.test.ts (Part A's own regression suite for this route).
//
// This exercises `addCustom` specifically — the action behind the itinerary
// editor's "Add it" button, including after "Fill from link" only populated
// the form (N) — and its own sort_order fix (the same MAX(sort_order)+1
// insertAtNextSortOrder addIdea now shares).
// ─────────────────────────────────────────────────────────────────────────────

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

let harness: Harness;

function patch(tripId: string, body: unknown) {
  const request = new Request(`https://domner.test/api/travel/itinerary/${tripId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: { tripId } });
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

async function seedTrip(destination = 'Vietnam') {
  const rows = await harness.asAdmin(
    `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Trip',$2) RETURNING id`,
    [ALICE, destination]
  );
  return rows[0].id as string;
}

describe('PATCH addCustom — "Add it" (Phase 13.5)', () => {
  it('O: persists a destination_places row and an itinerary_places row, and the response already includes it — no reload needed', async () => {
    const tripId = await seedTrip();

    // The shape a "Fill from link" resolve would have populated the form
    // with — coordinates present, nothing persisted yet until this call.
    const response = await patch(tripId, {
      action: 'addCustom',
      name: 'Riverside Hotel',
      description: 'Filled from a Google Maps link',
      category: 'stay',
      lat: 21.0285,
      lng: 105.8542,
      openingStart: null,
      openingEnd: null,
      target: 'ideas',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // The refreshed snapshot already carries it — this is what lets the UI
    // show the place without a full page reload.
    expect(body.ideas).toHaveLength(1);
    expect(body.ideas[0].place.name).toBe('Riverside Hotel');
    expect(body.ideas[0].place.category).toBe('stay');

    expect(await harness.rows('destination_places')).toHaveLength(1);
    expect(await harness.rows('itinerary_places')).toHaveLength(1);
  });

  it('A (addCustom): fills a gap in the target day rather than colliding on COUNT(*)', async () => {
    const tripId = await seedTrip();

    // Seed a day with a gap the same way a delete/move leaves one: sort_order
    // {0,2}, row at 1 gone.
    const [{ id: dayId }] = await harness.asAdmin(
      `INSERT INTO itinerary_days (trip_id, day_index, date) VALUES ($1, 1, NULL) RETURNING id`,
      [tripId]
    );
    const [{ id: placeA }] = await harness.asAdmin(
      `INSERT INTO destination_places (destination,name,category,lat,lng,description,source)
       VALUES ('Vietnam','Place A','spot',0,0,'','editorial') RETURNING id`
    );
    const [{ id: placeC }] = await harness.asAdmin(
      `INSERT INTO destination_places (destination,name,category,lat,lng,description,source)
       VALUES ('Vietnam','Place C','spot',0,0,'','editorial') RETURNING id`
    );
    await harness.asAdmin(
      `INSERT INTO itinerary_places (itinerary_day_id, place_id, category, sort_order) VALUES ($1,$2,'spot',0)`,
      [dayId, placeA]
    );
    await harness.asAdmin(
      `INSERT INTO itinerary_places (itinerary_day_id, place_id, category, sort_order) VALUES ($1,$2,'spot',2)`,
      [dayId, placeC]
    );

    const response = await patch(tripId, {
      action: 'addCustom',
      name: 'New Stop',
      description: '',
      category: 'other',
      lat: null,
      lng: null,
      openingStart: null,
      openingEnd: null,
      target: dayId,
    });

    expect(response.status).toBe(200);
    const rows = await harness.rows('itinerary_places');
    expect(rows).toHaveLength(3);
    const sortOrders = rows.map((row) => row.sort_order).sort();
    expect(sortOrders).toEqual([0, 2, 3]); // never collides with the surviving row at 2
  });
});
