// ─────────────────────────────────────────────────────────────────────────────
// Creating a trip when the traveler already has a lot of them.
//
// THE BUG THIS PINS, reported from production:
//   "I fill in the information, press create, and it says the trip could not
//   be found."
//
//   POST /api/travel/trips inserts the row, then calls tripById() to read it
//   back — deliberately, so the card the traveler lands on is derived by the
//   same code path as every other card. But tripById() searches
//   loadTravelerContext(), and that loads trips with
//
//       .order('start_date', { ascending: true, nullsFirst: false }).limit(20)
//
//   so it only ever holds the twenty earliest-dated trips. Past twenty, a
//   newly created trip falls outside that window, `find()` returns undefined,
//   and the route throws NOT_FOUND — on a trip that was just written
//   successfully and is sitting in the database.
//
//   Two things made it worse than a cosmetic error:
//     • The insert had already COMMITTED. The traveler saw a failure, pressed
//       create again, and got a second row. Every retry pushed them further
//       past the limit, so the bug fed itself.
//     • Wishlist trips (start_date NULL) sort last under `nullsFirst: false`,
//       so they were the first to fall out of the window.
//
//   It is invisible below twenty trips, which is why it surfaced only after
//   heavy use — and why no existing test caught it.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '' }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
const alice = () => ({ id: session.userId, email: 'alice@example.com', user_metadata: {} });

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => alice(),
  // loadTravelerContext resolves the caller through getUser, not requireUser.
  getUser: async () => alice(),
  supabaseFromRequest: () => session.client,
}));

const { POST, GET } = await import('@/app/api/travel/trips/route');

let harness: Harness;

function createTrip(body: Record<string, unknown>) {
  return POST(
    new Request('https://domner.test/api/travel/trips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
      body: JSON.stringify(body),
    })
  );
}

/** Seeds trips directly, bypassing the route, to set up the precondition. */
async function seedTrips(count: number, startFrom: string) {
  for (let i = 0; i < count; i += 1) {
    const date = new Date(`${startFrom}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const day = date.toISOString().slice(0, 10);
    await harness.asAdmin(
      `INSERT INTO trip_plans (user_id, title, destination, start_date, end_date, travelers)
       VALUES ($1, $2, 'Thailand', $3, $3, 1)`,
      [ALICE, `Seeded trip ${i + 1}`, day]
    );
  }
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  session.userId = ALICE;
  session.client = harness.clientFor(ALICE);
});

afterAll(async () => {
  await harness.close();
});

describe('creating a trip past the context window', () => {
  it('returns the created trip when the traveler has only a few', async () => {
    // The control: well under the limit, this has always worked.
    await seedTrips(3, '2026-01-01');

    const response = await createTrip({
      title: 'Saigon in March',
      destination: 'Vietnam',
      startDate: '2026-03-01',
      endDate: '2026-03-05',
      travelers: 2,
      interests: [],
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.trip.title).toBe('Saigon in March');
  });

  it('still returns the trip when the traveler already has twenty', async () => {
    // The reported failure. Twenty earlier-dated trips fill the whole window,
    // so the new one — dated after all of them — falls outside it.
    await seedTrips(20, '2026-01-01');

    const response = await createTrip({
      title: 'Saigon in December',
      destination: 'Vietnam',
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      travelers: 2,
      interests: [],
    });

    const body = await response.json();
    expect(
      response.status,
      `expected 201, got ${response.status}: ${JSON.stringify(body?.error ?? body)}`
    ).toBe(201);
    expect(body.trip.title).toBe('Saigon in December');
    expect(body.trip.destination).toBe('Vietnam');
  });

  it('still returns an undated trip, which sorts last of all', async () => {
    // Wishlist trips carry no dates, so `nullsFirst: false` puts them at the
    // very end of the ordering — the first rows to fall out of the window.
    await seedTrips(20, '2026-01-01');

    const response = await createTrip({
      title: 'Someday: Kuala Lumpur',
      destination: 'Malaysia',
      startDate: null,
      endDate: null,
      travelers: 1,
      interests: [],
    });

    const body = await response.json();
    expect(
      response.status,
      `expected 201, got ${response.status}: ${JSON.stringify(body?.error ?? body)}`
    ).toBe(201);
    expect(body.trip.title).toBe('Someday: Kuala Lumpur');
    expect(body.trip.startDate).toBeNull();
  });

  it('never reports failure on a trip it actually wrote', async () => {
    // The compounding failure: an error the traveler retries past, leaving a
    // row behind each time. Whatever the response, the database must not end
    // up disagreeing with what the traveler was told.
    await seedTrips(20, '2026-01-01');

    const response = await createTrip({
      title: 'Phnom Penh weekend',
      destination: 'Cambodia',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      travelers: 1,
      interests: [],
    });

    const written = (await harness.rows('trip_plans')).filter(
      (row) => row.title === 'Phnom Penh weekend'
    );

    if (response.status === 201) {
      expect(written).toHaveLength(1);
    } else {
      // A failure response with a committed row is the exact trap: the
      // traveler retries and silently accumulates duplicates.
      expect(
        written,
        'the route reported failure but the trip was written anyway'
      ).toHaveLength(0);
    }
  });
});

describe('the trips list', () => {
  it('shows every trip, not just the first twenty', async () => {
    // The same cap, seen from the other side. A traveler with more than twenty
    // trips opened their own trips page and found some of them simply absent —
    // which reads as data loss, not as a page size.
    await seedTrips(25, '2026-01-01');

    const response = await GET(
      new Request('https://domner.test/api/travel/trips', {
        headers: { 'x-forwarded-for': '203.0.113.11' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.trips).toHaveLength(25);
  });
});
