import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addIdeaToTrip, savePlaceForTraveler } from '@/lib/travel/savedPlaces';

// ─────────────────────────────────────────────────────────────────────────────
// An in-memory stand-in for the session client.
//
// It stores rows rather than recording calls, so these tests can assert the
// thing that actually matters — how many destination_places rows exist after
// two saves — instead of asserting that some method was called twice.
//
// It models PostgREST shape only. It does NOT model RLS: every policy check
// passes here. See the note at the bottom of this file.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function fakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    trip_plans: [],
    destination_places: [],
    itinerary_days: [],
    itinerary_places: [],
  };
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));

  let counter = 0;
  const nextId = () => `generated-${++counter}`;

  function from(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: Array<(row: Row) => boolean> = [];
    let written: Row[] | null = null;
    let head = false;
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitTo: number | null = null;

    const matched = () => {
      let result = written ?? rows().filter((row) => filters.every((test) => test(row)));
      if (orderBy) {
        const { column, ascending } = orderBy;
        result = [...result].sort((a, b) => {
          const av = a[column] as number;
          const bv = b[column] as number;
          return ascending ? av - bv : bv - av;
        });
      }
      if (limitTo !== null) result = result.slice(0, limitTo);
      return result;
    };

    const api = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (options?.head) head = true;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderBy = { column, ascending: options?.ascending !== false };
        return api;
      },
      limit(count: number) {
        limitTo = count;
        return api;
      },
      ilike(column: string, value: string) {
        filters.push((row) => String(row[column] ?? '').toLowerCase() === value.toLowerCase());
        return api;
      },
      or(expression: string) {
        const clauses = expression.split(',');
        filters.push((row) =>
          clauses.some((clause) => {
            const [column, operator, operand] = clause.split('.');
            const value = row[column];
            if (operator === 'is') return operand === 'null' && (value === null || value === undefined);
            if (operator === 'gte') return value !== null && value !== undefined && String(value) >= operand;
            throw new Error(`fake supabase: unsupported operator "${operator}"`);
          })
        );
        return api;
      },
      insert(row: Row) {
        const created = { id: nextId(), ...row };
        rows().push(created);
        written = [created];
        return api;
      },
      maybeSingle() {
        return Promise.resolve({ data: matched()[0] ?? null, error: null });
      },
      single() {
        const data = matched();
        return Promise.resolve(
          data.length === 1
            ? { data: data[0], error: null }
            : { data: null, error: { message: `expected one row, got ${data.length}` } }
        );
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        const data = matched();
        return Promise.resolve(
          head ? { data: null, count: data.length, error: null } : { data, count: data.length, error: null }
        ).then(resolve, reject);
      },
    };

    return api;
  }

  return { client: { from } as unknown as SupabaseClient, tables };
}

const USER = 'user-1';

const WAT_PHO = { destination: 'Thailand', contentSlug: 'thailand:wat-pho' };

/** The catalogue row the generated seed file puts there ahead of any save. */
const SEEDED_WAT_PHO = {
  id: 'place-1',
  destination: 'Thailand',
  name: 'Wat Pho',
  category: 'spot',
  content_slug: 'thailand:wat-pho',
  created_by: null,
  source: 'editorial',
};

describe('addIdeaToTrip', () => {
  it('creates the Ideas day on first use and appends in order after it', async () => {
    const { client, tables } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Thailand trip', destination: 'Thailand' }],
      destination_places: [
        { id: 'place-1', destination: 'Thailand', category: 'spot' },
        { id: 'place-2', destination: 'Thailand', category: 'food' },
      ],
    });

    const first = await addIdeaToTrip(client, 'trip-1', 'place-1');
    const second = await addIdeaToTrip(client, 'trip-1', 'place-2');

    expect(tables.itinerary_days).toHaveLength(1);
    expect(tables.itinerary_days[0].day_index).toBe(0);
    expect(first).not.toBe(second);
    expect(tables.itinerary_places.map((row) => row.sort_order)).toEqual([0, 1]);
    expect(tables.itinerary_places.map((row) => row.category)).toEqual(['spot', 'food']);
  });

  it('refuses a place belonging to another destination', async () => {
    const { client } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Thailand trip', destination: 'Thailand' }],
      destination_places: [{ id: 'place-1', destination: 'Japan', category: 'spot' }],
    });

    await expect(addIdeaToTrip(client, 'trip-1', 'place-1')).rejects.toThrow(
      'That place could not be found.'
    );
  });
});

describe('savePlaceForTraveler', () => {
  it('files the seeded catalogue row without ever writing to the catalogue', async () => {
    const { client, tables } = fakeSupabase({
      destination_places: [SEEDED_WAT_PHO],
      trip_plans: [
        { id: 'trip-1', user_id: USER, title: 'Thailand trip', destination: 'Thailand', end_date: null },
      ],
    });

    const first = await savePlaceForTraveler(client, USER, WAT_PHO);
    const second = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(first).toEqual({
      status: 'saved', tripId: 'trip-1', tripTitle: 'Thailand trip',
      createdTrip: false, alreadySaved: false,
    });
    // Saving twice is a no-op, not a second copy — a save button on a phone
    // gets double-tapped.
    expect(second).toMatchObject({ status: 'saved', createdTrip: false, alreadySaved: true });
    expect(tables.destination_places).toHaveLength(1);
    expect(tables.itinerary_places).toHaveLength(1);
    expect(tables.itinerary_places[0].place_id).toBe('place-1');
  });

  it('creates a wishlist trip when the traveler has none for that country', async () => {
    const { client, tables } = fakeSupabase({ destination_places: [SEEDED_WAT_PHO] });

    const result = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(result).toMatchObject({ status: 'saved', createdTrip: true, tripTitle: 'Thailand trip' });
    expect(tables.trip_plans).toHaveLength(1);
    expect(tables.trip_plans[0]).toMatchObject({
      user_id: USER,
      destination: 'Thailand',
      title: 'Thailand trip',
      start_date: null,
      end_date: null,
      travelers: 1,
      is_wishlist: true,
    });
    expect(tables.trip_plans[0].interests).toEqual([]);
    expect(tables.itinerary_places).toHaveLength(1);
  });

  it('reuses the one open trip, ignoring finished trips and other travelers', async () => {
    const { client, tables } = fakeSupabase({
      destination_places: [SEEDED_WAT_PHO],
      trip_plans: [
        { id: 'trip-old', user_id: USER, title: 'Last year', destination: 'Thailand', end_date: '2020-01-05' },
        { id: 'trip-1', user_id: USER, title: 'Songkran', destination: 'Thailand', end_date: '2099-04-20' },
        { id: 'trip-other', user_id: 'user-2', title: 'Not mine', destination: 'Thailand', end_date: null },
      ],
    });

    const result = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(result).toEqual({
      status: 'saved',
      tripId: 'trip-1',
      tripTitle: 'Songkran',
      createdTrip: false,
      alreadySaved: false,
    });
    expect(tables.trip_plans).toHaveLength(3);
    expect(tables.itinerary_days[0].trip_id).toBe('trip-1');
  });

  it('does not reuse a trip whose destination differs in case', async () => {
    // trip_plans.destination is free text, and the whole itinerary feature
    // compares it exactly. A "thailand" trip cannot hold a "Thailand" place, so
    // the traveler gets a trip that actually works instead of a broken one.
    const { client, tables } = fakeSupabase({
      destination_places: [SEEDED_WAT_PHO],
      trip_plans: [
        { id: 'trip-lower', user_id: USER, title: 'songkran', destination: 'thailand', end_date: null },
      ],
    });

    const result = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(result).toMatchObject({ status: 'saved', createdTrip: true });
    expect(tables.trip_plans).toHaveLength(2);
    expect(tables.trip_plans[1].destination).toBe('Thailand');
  });

  it('asks which trip when there are two, and writes nothing at all', async () => {
    const { client, tables } = fakeSupabase({
      destination_places: [SEEDED_WAT_PHO],
      trip_plans: [
        { id: 'trip-1', user_id: USER, title: 'Songkran', destination: 'Thailand', end_date: '2099-04-20' },
        { id: 'trip-2', user_id: USER, title: 'Islands', destination: 'Thailand', end_date: null },
      ],
    });

    const result = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(result).toEqual({
      status: 'needsChoice',
      candidates: [
        { id: 'trip-1', title: 'Songkran' },
        { id: 'trip-2', title: 'Islands' },
      ],
    });
    // A no-op means a no-op: no third trip, no Ideas day, nothing filed.
    expect(tables.trip_plans).toHaveLength(2);
    expect(tables.itinerary_days).toHaveLength(0);
    expect(tables.itinerary_places).toHaveLength(0);
  });

  it('refuses a slug the seed has not put in the catalogue', async () => {
    const { client, tables } = fakeSupabase();

    await expect(savePlaceForTraveler(client, USER, WAT_PHO)).rejects.toThrow(
      'That place is not in our guide yet.'
    );
    expect(tables.trip_plans).toHaveLength(0);
  });
});

// NOTE: this fake grants every write, so it proves control flow and nothing
// about what the database will allow. tests/savedPlaces.rls.test.ts runs the
// same functions against a real Postgres with the real policies applied.
