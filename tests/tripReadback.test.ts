// ─────────────────────────────────────────────────────────────────────────────
// Creating a trip must never report that the trip does not exist.
//
// THE BUG THIS PINS DOWN:
//   POST /api/travel/trips inserted the row, then re-read it through
//   loadTravelerContext and looked for it in the returned list. Three things
//   could make that list not contain a row that genuinely existed:
//
//     1. the select named `is_wishlist` (migration 011) or `cover_image_url`,
//        and the live schema — which is dashboard-managed, not migrated — did
//        not have it, so PostgREST failed the whole statement and the list came
//        back empty;
//     2. the list was capped at 20 and the new trip sorted outside the window;
//     3. the trips table was unreachable altogether.
//
//   All three produced the same screen: the create form, with the row already
//   committed, saying "That trip could not be found." Pressing Create again
//   wrote a second trip.
//
//   Each case gets a test here, and each asserts the traveler is given their
//   trip — or, for a real outage, told it is an outage rather than told the trip
//   is missing.
//
// The Supabase client is a fake rather than real Postgres: what is under test is
// how this code reacts to a query FAILING, and a healthy database cannot produce
// that on demand.
// ─────────────────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import {
  createFakeSupabase,
  failsWith,
  okData,
  type Answering,
  type FakeQuery,
  type FakeSupabase,
} from './support/fakeSupabase';

const ALICE = '11111111-1111-4111-8111-111111111111';
const NEW_TRIP = '33333333-3333-4333-8333-333333333333';

const session = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: ALICE }),
  getUser: async () => ({ id: ALICE, email: 'alice@example.com', user_metadata: {} }),
  supabaseFromRequest: () => session.fake.client,
}));

session.fake = createFakeSupabase(() => okData([]));

const { POST } = await import('@/app/api/travel/trips/route');

const DRAFT = {
  title: 'Kuala Lumpur trip',
  destination: 'Malaysia',
  startDate: '2026-08-25',
  endDate: '2026-08-27',
  travelers: 1,
  interests: ['food', 'nightlife'],
};

function create(body: unknown = DRAFT) {
  return POST(
    new Request('https://domner.test/api/travel/trips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
      body: JSON.stringify(body),
    }),
    { params: {} }
  );
}

const ok = okData;
const fails = failsWith;

/** The row PostgREST would return for a saved trip. */
function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: DRAFT.title,
    destination: DRAFT.destination,
    start_date: DRAFT.startDate,
    end_date: DRAFT.endDate,
    travelers: 1,
    interests: DRAFT.interests,
    cover_image_url: null,
    is_wishlist: false,
    ...overrides,
  };
}

/** Everything except trip_plans answers empty; trip_plans is per-test. */
function answering(trips: Answering): Answering {
  return (query: FakeQuery) => {
    if (query.table !== 'trip_plans') return ok([]);
    // The adoption probe (lib/travel/tripSeed.ts) is a different question from
    // the read-back these tests are about: no wishlist trip to adopt, so every
    // create here goes down the insert path. Adoption has its own suite.
    if (query.filters.is_wishlist !== undefined) return ok([]);
    if (query.op === 'insert') return ok({ id: NEW_TRIP });
    return trips(query);
  };
}

beforeEach(() => {
  __resetRateLimits();
  session.fake = createFakeSupabase(() => okData([]));
});

describe('creating a trip on a database missing migration 011', () => {
  it('still returns the created trip instead of "could not be found"', async () => {
    session.fake.answer = answering((query) =>
      // Exactly what PostgREST does with an unknown column: the whole select
      // fails, not just that field.
      query.columns.includes('is_wishlist')
        ? fails('42703', 'column trip_plans.is_wishlist does not exist')
        : ok([row(NEW_TRIP)])
    );

    const response = await create();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.trip.id).toBe(NEW_TRIP);
    expect(body.trip.title).toBe(DRAFT.title);
  });

  it('retries with the columns the table has always had', async () => {
    session.fake.answer = answering((query) =>
      query.columns.includes('is_wishlist')
        ? fails('42703', 'column trip_plans.is_wishlist does not exist')
        : ok([row(NEW_TRIP)])
    );

    await create();

    const narrow = session.fake.seen.filter(
      (query) => query.table === 'trip_plans' && query.op === 'select' && !query.columns.includes('is_wishlist')
    );
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow[0].columns).not.toContain('cover_image_url');
  });
});

describe('creating a trip that falls outside the list window', () => {
  it('fetches it by id rather than calling it missing', async () => {
    session.fake.answer = answering((query) =>
      // The list is full of other people's-worth of older trips; only a lookup
      // filtered to this id returns the new one.
      query.filters.id === NEW_TRIP ? ok([row(NEW_TRIP)]) : ok([row('other-trip')])
    );

    const response = await create();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.trip.id).toBe(NEW_TRIP);
    expect(session.fake.seen.some((query) => query.filters.id === NEW_TRIP)).toBe(true);
  });
});

describe('when the trips table cannot be read at all', () => {
  it('still hands back the trip it just committed', async () => {
    session.fake.answer = answering(() => fails('42P01', 'relation "trip_plans" does not exist'));

    const response = await create();
    const body = await response.json();

    // The insert succeeded. Whatever happened next, the traveler owns a trip
    // now, and must be sent to it rather than back to the Create button.
    expect(response.status).toBe(201);
    expect(body.trip.id).toBe(NEW_TRIP);
  });
});

describe('tripById, on a plain read', () => {
  it('separates an unreachable table from a trip that is not there', async () => {
    const { tripById } = await import('@/lib/travel/tripWrites');
    const request = new Request('https://domner.test/api/travel/trips/x');

    session.fake.answer = answering(() => fails('42P01', 'relation "trip_plans" does not exist'));
    await expect(tripById(request, NEW_TRIP)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    session.fake.answer = answering(() => ok([]));
    await expect(tripById(request, NEW_TRIP)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
