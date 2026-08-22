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

    const matched = () => written ?? rows().filter((row) => filters.every((test) => test(row)));

    const api = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (options?.head) head = true;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
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
      upsert(row: Row, options: { onConflict: string; ignoreDuplicates?: boolean }) {
        const key = options.onConflict;
        const clash = rows().some(
          (existing) => existing[key] != null && existing[key] === row[key]
        );
        if (clash && options.ignoreDuplicates) {
          written = [];
          return api;
        }
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

const WAT_PHO = {
  destination: 'Thailand',
  contentSlug: 'bangkok:wat-pho',
  name: 'Wat Pho',
  description: 'Reclining Buddha.',
  category: 'spot' as const,
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
  it('reuses the catalogue row on a second save of the same slug', async () => {
    const { client, tables } = fakeSupabase({
      trip_plans: [
        { id: 'trip-1', user_id: USER, title: 'Thailand trip', destination: 'Thailand', end_date: null },
      ],
    });

    const first = await savePlaceForTraveler(client, USER, WAT_PHO);
    const second = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(first.status).toBe('saved');
    expect(second.status).toBe('saved');
    // The point of content_slug: one guide entry, one catalogue row, however
    // many times it is saved.
    expect(tables.destination_places).toHaveLength(1);
    expect(tables.destination_places[0].content_slug).toBe('bangkok:wat-pho');
    expect(tables.destination_places[0].created_by).toBeNull();
    expect(tables.destination_places[0].source).toBe('editorial');
    expect(tables.itinerary_places).toHaveLength(2);
  });

  it('creates a wishlist trip when the traveler has none for that country', async () => {
    const { client, tables } = fakeSupabase();

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

  it('reuses the one open trip it finds, ignoring case and finished trips', async () => {
    const { client, tables } = fakeSupabase({
      trip_plans: [
        { id: 'trip-old', user_id: USER, title: 'Last year', destination: 'Thailand', end_date: '2020-01-05' },
        { id: 'trip-1', user_id: USER, title: 'Songkran', destination: 'thailand', end_date: '2099-04-20' },
        { id: 'trip-other', user_id: 'user-2', title: 'Not mine', destination: 'Thailand', end_date: null },
      ],
    });

    const result = await savePlaceForTraveler(client, USER, WAT_PHO);

    expect(result).toEqual({
      status: 'saved',
      tripId: 'trip-1',
      tripTitle: 'Songkran',
      createdTrip: false,
    });
    expect(tables.trip_plans).toHaveLength(3);
    expect(tables.itinerary_days[0].trip_id).toBe('trip-1');
    // Stamped with the trip's stored casing, not the caller's, or the exact
    // destination match in addIdeaToTrip would refuse its own new row.
    expect(tables.destination_places[0].destination).toBe('thailand');
    expect(tables.itinerary_places).toHaveLength(1);
  });

  it('asks which trip when there are two, and writes nothing at all', async () => {
    const { client, tables } = fakeSupabase({
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
    // A no-op means a no-op: no catalogue row, no third trip, no Ideas day.
    expect(tables.destination_places).toHaveLength(0);
    expect(tables.trip_plans).toHaveLength(2);
    expect(tables.itinerary_days).toHaveLength(0);
    expect(tables.itinerary_places).toHaveLength(0);
  });
});

// NOTE: this fake grants every write. It proves the control flow, not that the
// database will accept it. `createPlace` inserts with created_by NULL, and the
// only INSERT policy on destination_places is `destination_places_insert_own`
// — WITH CHECK (created_by = auth.uid()) — which NULL fails. Against a real
// Supabase project that insert is rejected until a policy migration allows it.
