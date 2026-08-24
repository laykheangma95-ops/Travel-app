// ─────────────────────────────────────────────────────────────────────────────
// One continuous trip object: what creating a trip now does beyond the row.
//
// Two behaviours are under test, both of them the difference between four
// disconnected screens and one thread:
//
//   1. The day grid exists as soon as the dates do. A trip that runs 25–27
//      August has day 0 (Ideas) and days 1–3, dated, without anyone pressing
//      "Add day".
//   2. A trip auto-created by saving a place (`is_wishlist`) is ADOPTED by the
//      create rather than duplicated, so the places already gathered for that
//      destination are on the trip from the first second — and the next save
//      stops having to ask which of two Malaysia trips it meant.
//
// Both are enrichments of a write that has already committed, so the last group
// asserts the thing that matters most: none of it can turn a created trip into
// an error the traveler sees.
// ─────────────────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import {
  createFakeSupabase,
  failsWith,
  okData,
  type Answering,
  type FakeAnswer,
  type FakeQuery,
  type FakeSupabase,
} from './support/fakeSupabase';

const ALICE = '11111111-1111-4111-8111-111111111111';
const NEW_TRIP = '33333333-3333-4333-8333-333333333333';
const WISHLIST_TRIP = '44444444-4444-4444-8444-444444444444';

const session = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: ALICE }),
  getUser: async () => ({ id: ALICE, email: 'alice@example.com', user_metadata: {} }),
  supabaseFromRequest: () => session.fake.client,
}));

session.fake = createFakeSupabase(() => okData([]));

const { POST } = await import('@/app/api/travel/trips/route');
const { PATCH } = await import('@/app/api/travel/trips/[tripId]/route');

const DRAFT = {
  title: 'Malaysia trip',
  destination: 'Malaysia',
  startDate: '2026-08-25',
  endDate: '2026-08-27',
  travelers: 1,
  interests: [],
};

function create(body: Record<string, unknown> = DRAFT) {
  return POST(
    new Request('https://domner.test/api/travel/trips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.12' },
      body: JSON.stringify(body),
    }),
    { params: {} }
  );
}

function edit(tripId: string, body: Record<string, unknown>) {
  return PATCH(
    new Request(`https://domner.test/api/travel/trips/${tripId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.13' },
      body: JSON.stringify(body),
    }),
    { params: { tripId } }
  );
}

/** The row PostgREST returns for a saved trip, as the context loader selects it. */
function tripRow(id: string, draft: Record<string, unknown> = DRAFT) {
  return {
    id,
    title: draft.title,
    destination: draft.destination,
    start_date: draft.startDate,
    end_date: draft.endDate,
    travelers: draft.travelers,
    interests: draft.interests,
    cover_image_url: null,
    is_wishlist: false,
  };
}

/**
 * The default world: no wishlist trip to adopt, no days yet, an insert returns
 * a new id, and the read-back finds the row it was pointed at. Each test
 * overrides one part.
 */
type Override = (query: FakeQuery) => FakeAnswer | null;

function world(overrides: { trips?: Override; days?: Override } = {}): Answering {
  return (query: FakeQuery) => {
    if (query.table === 'itinerary_days') return overrides.days?.(query) ?? okData([]);
    if (query.table !== 'trip_plans') return okData([]);
    if (overrides.trips) {
      const answer = overrides.trips(query);
      if (answer) return answer;
    }
    if (query.filters.is_wishlist !== undefined) return okData([]);
    if (query.op === 'insert') return okData({ id: NEW_TRIP });
    // The read-back: the list comes back empty and `ensureTripId` fetches the
    // row by id, which is the path a freshly written trip actually takes.
    if (query.columns.includes('title') && typeof query.filters.id === 'string') {
      return okData([tripRow(query.filters.id)]);
    }
    return okData([]);
  };
}

/** Every itinerary_days row this run tried to insert. */
function seededDays() {
  return session.fake.seen
    .filter((query) => query.table === 'itinerary_days' && query.op === 'insert')
    .flatMap((query) => (Array.isArray(query.inserted) ? query.inserted : [query.inserted!]));
}

beforeEach(() => {
  __resetRateLimits();
  session.fake = createFakeSupabase(() => okData([]));
});

describe('the day grid, seeded from the dates', () => {
  it('creates Ideas plus one dated day per day of the trip', async () => {
    session.fake.answer = world();

    const response = await create();
    expect(response.status).toBe(201);

    expect(seededDays()).toEqual([
      { trip_id: NEW_TRIP, day_index: 0, date: null },
      { trip_id: NEW_TRIP, day_index: 1, date: '2026-08-25' },
      { trip_id: NEW_TRIP, day_index: 2, date: '2026-08-26' },
      { trip_id: NEW_TRIP, day_index: 3, date: '2026-08-27' },
    ]);
  });

  it('creates only the Ideas list when there are no dates yet', async () => {
    session.fake.answer = world();

    await create({ ...DRAFT, startDate: null, endDate: null });

    // A day grid without dates would be inventing a trip length nobody chose.
    expect(seededDays()).toEqual([{ trip_id: NEW_TRIP, day_index: 0, date: null }]);
  });

  it('does not duplicate days that already exist', async () => {
    session.fake.answer = world({
      days: (query) =>
        query.op === 'select'
          ? okData([
              { id: 'day-0', day_index: 0, date: null },
              { id: 'day-1', day_index: 1, date: '2026-08-25' },
            ])
          : okData([]),
    });

    await create();

    expect(seededDays().map((row) => row.day_index)).toEqual([2, 3]);
  });

  it('re-dates the days that exist when the trip moves, and deletes nothing', async () => {
    session.fake.answer = world({
      days: (query) =>
        query.op === 'select'
          ? okData([
              { id: 'day-0', day_index: 0, date: null },
              { id: 'day-1', day_index: 1, date: '2026-08-25' },
              // Day 5 is beyond the new two-day window and holds somebody's work.
              { id: 'day-5', day_index: 5, date: '2026-08-29' },
            ])
          : okData([]),
      trips: (query) => (query.op === 'update' ? okData({ id: NEW_TRIP }) : null),
    });

    await edit(NEW_TRIP, { ...DRAFT, startDate: '2026-09-01', endDate: '2026-09-02' });

    const restamped = session.fake.seen.filter(
      (query) => query.table === 'itinerary_days' && query.op === 'update'
    );
    expect(restamped.map((query) => query.updated?.date)).toEqual(['2026-09-01', '2026-09-05']);
    expect(
      session.fake.seen.some((query) => query.table === 'itinerary_days' && query.op === 'delete')
    ).toBe(false);
  });
});

describe('adopting the wishlist trip a saved place created', () => {
  const wishlistFound: Override = (query) =>
    query.filters.is_wishlist === true ? okData([{ id: WISHLIST_TRIP }]) : null;

  it('becomes that trip instead of creating a second one', async () => {
    session.fake.answer = world({
      trips: (query) => {
        if (query.filters.is_wishlist === true) return okData([{ id: WISHLIST_TRIP }]);
        if (query.op === 'update') return okData({ id: WISHLIST_TRIP });
        return null;
      },
    });

    const response = await create();
    const body = await response.json();

    expect(body.trip.id).toBe(WISHLIST_TRIP);
    // Read back through the context loader, not echoed from the request: this
    // is the same shape every other trip card is derived into.
    expect(body.trip.title).toBe(DRAFT.title);
    expect(body.trip.readiness).toBeDefined();
    // No second Malaysia row: the ideas already hanging off the wishlist trip
    // are on the trip because it IS the trip.
    expect(session.fake.seen.some((query) => query.table === 'trip_plans' && query.op === 'insert')).toBe(
      false
    );
  });

  it('clears the wishlist flag and writes the form over it', async () => {
    session.fake.answer = world({
      trips: (query) => {
        if (query.filters.is_wishlist === true) return okData([{ id: WISHLIST_TRIP }]);
        if (query.op === 'update') return okData({ id: WISHLIST_TRIP });
        return null;
      },
    });

    await create();

    const update = session.fake.seen.find(
      (query) => query.table === 'trip_plans' && query.op === 'update'
    );
    expect(update?.updated).toMatchObject({
      is_wishlist: false,
      title: DRAFT.title,
      destination: 'Malaysia',
      start_date: '2026-08-25',
    });
  });

  it('only ever considers the caller’s own dateless wishlist trips', async () => {
    session.fake.answer = world({ trips: wishlistFound });
    await create();

    const probe = session.fake.seen.find((query) => query.filters.is_wishlist !== undefined);
    // trips_public_read means a select can see other people's public trips, so
    // the owner filter is what makes this row safe to write to.
    expect(probe?.filters).toMatchObject({
      user_id: ALICE,
      destination: 'Malaysia',
      is_wishlist: true,
      start_date: null,
    });
  });

  it('leaves both alone when two wishlist trips match', async () => {
    session.fake.answer = world({
      trips: (query) =>
        query.filters.is_wishlist === true
          ? okData([{ id: WISHLIST_TRIP }, { id: 'another-wishlist' }])
          : null,
    });

    const response = await create();
    const body = await response.json();

    // Picking one at random would be inventing an answer.
    expect(body.trip.id).toBe(NEW_TRIP);
    expect(session.fake.seen.some((query) => query.table === 'trip_plans' && query.op === 'update')).toBe(
      false
    );
  });

  it('still creates the trip on a database without migration 011', async () => {
    session.fake.answer = world({
      trips: (query) =>
        query.filters.is_wishlist !== undefined
          ? failsWith('42703', 'column trip_plans.is_wishlist does not exist')
          : null,
    });

    const response = await create();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.trip.id).toBe(NEW_TRIP);
  });
});

describe('when seeding itself fails', () => {
  it('the trip is still created', async () => {
    session.fake.answer = world({
      days: () => failsWith('42P01', 'relation "itinerary_days" does not exist'),
    });

    const response = await create();
    const body = await response.json();

    // The row is the commitment. The grid is an enrichment, and the itinerary
    // screen can still add days by hand.
    expect(response.status).toBe(201);
    expect(body.trip.id).toBe(NEW_TRIP);
  });
});
