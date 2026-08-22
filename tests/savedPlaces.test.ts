import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { savePlaceForTraveler, type SavePlaceInput } from '@/lib/travel/savedPlaces';

// ─────────────────────────────────────────────────────────────────────────────
// A fake Postgres, small enough to read and honest about the two things this
// module actually depends on the database for: the (created_by, content_slug)
// unique index from migration 011, and RLS-shaped filtering by user_id.
//
// Everything else here is a plain in-memory table. Reaching for a real Supabase
// instance would test the network, not this logic.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const USER = '20000000-0000-4000-8000-000000000001';

class UniqueViolation extends Error {}

function makeDb() {
  const tables: Record<string, Row[]> = {
    destination_places: [],
    trip_plans: [],
    itinerary_days: [],
    itinerary_places: [],
  };
  let sequence = 0;
  const nextId = () => `10000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;

  function insertRow(table: string, values: Row): Row {
    if (table === 'destination_places' && values.content_slug != null) {
      const clash = tables[table].some(
        (row) =>
          row.created_by === values.created_by && row.content_slug === values.content_slug
      );
      if (clash) throw new UniqueViolation('destination_places_owner_content_slug_idx');
    }
    const row: Row = { id: nextId(), created_at: `2026-01-${String(sequence).padStart(2, '0')}`, ...values };
    tables[table].push(row);
    return row;
  }

  return { tables, insertRow };
}

type Db = ReturnType<typeof makeDb>;

/** Only the fragments savedPlaces.ts actually builds. */
function query(db: Db, table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let pending: { kind: 'select' } | { kind: 'insert'; values: Row } | { kind: 'upsert'; values: Row; ignoreDuplicates: boolean } = { kind: 'select' };
  let headCount = false;
  let orderKey: string | null = null;
  let conflicted = false;

  const rows = () => db.tables[table].filter((row) => filters.every((match) => match(row)));

  const builder = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    ilike(column: string, value: string) {
      const needle = value.replace(/\\([\\%_])/g, '$1').toLowerCase();
      filters.push((row) => String(row[column] ?? '').toLowerCase() === needle);
      return builder;
    },
    or(expression: string) {
      const clauses = expression.split(',');
      filters.push((row) =>
        clauses.some((clause) => {
          const [column, operator, operand] = clause.split('.');
          if (operator === 'is' && operand === 'null') return row[column] == null;
          if (operator === 'gte') return row[column] != null && String(row[column]) >= operand;
          throw new Error(`unsupported or() clause: ${clause}`);
        })
      );
      return builder;
    },
    order(column: string) {
      orderKey = column;
      return builder;
    },
    insert(values: Row) {
      pending = { kind: 'insert', values };
      return builder;
    },
    upsert(values: Row, options?: { ignoreDuplicates?: boolean }) {
      pending = { kind: 'upsert', values, ignoreDuplicates: options?.ignoreDuplicates ?? false };
      return builder;
    },
    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      headCount = Boolean(options?.head);
      return builder;
    },
    run() {
      if (pending.kind === 'insert') {
        try {
          return { data: db.insertRow(table, pending.values), error: null };
        } catch {
          return { data: null, error: { message: 'duplicate key' } };
        }
      }
      if (pending.kind === 'upsert') {
        try {
          return { data: db.insertRow(table, pending.values), error: null };
        } catch (cause) {
          if (cause instanceof UniqueViolation && pending.ignoreDuplicates) {
            conflicted = true;
            return { data: null, error: null };
          }
          return { data: null, error: { message: 'duplicate key' } };
        }
      }
      const found = orderKey
        ? [...rows()].sort((a, b) => String(a[orderKey!]).localeCompare(String(b[orderKey!])))
        : rows();
      return { data: found, error: null, count: found.length };
    },
    async single() {
      const result = builder.run();
      if (Array.isArray(result.data)) return { data: result.data[0] ?? null, error: result.data.length ? null : { message: 'no rows' } };
      return result;
    },
    async maybeSingle() {
      const result = builder.run();
      if (Array.isArray(result.data)) return { data: result.data[0] ?? null, error: null };
      // An ignoreDuplicates upsert that skipped returns no row and no error.
      if (conflicted) return { data: null, error: null };
      return result;
    },
    then(resolve: (value: { data: Row[] | null; error: unknown; count?: number }) => unknown) {
      const result = builder.run();
      const data = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      return Promise.resolve(
        resolve({ data: headCount ? null : data, error: result.error, count: data.length })
      );
    },
  };

  return builder;
}

function fakeClient(db: Db): SupabaseClient {
  return { from: (table: string) => query(db, table) } as unknown as SupabaseClient;
}

const INPUT: SavePlaceInput = {
  destination: 'Thailand',
  contentSlug: 'bangkok:wat-pho',
  name: 'Wat Pho and the reclining Buddha',
  description: 'Quieter and older than the Grand Palace next door.',
  category: 'spot',
};

describe('savePlaceForTraveler', () => {
  it('creates a wishlist trip when the traveler has none for that destination', async () => {
    const db = makeDb();
    const result = await savePlaceForTraveler(fakeClient(db), USER, INPUT);

    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.createdTrip).toBe(true);

    expect(db.tables.trip_plans).toHaveLength(1);
    const trip = db.tables.trip_plans[0];
    expect(trip.is_wishlist).toBe(true);
    expect(trip.user_id).toBe(USER);
    expect(trip.start_date).toBeNull();
    expect(trip.end_date).toBeNull();

    // It landed in Ideas — day_index 0 — not on a numbered day.
    expect(db.tables.itinerary_days).toHaveLength(1);
    expect(db.tables.itinerary_days[0].day_index).toBe(0);
    expect(db.tables.itinerary_places).toHaveLength(1);
  });

  it('reuses one destination_places row when the same place is saved twice', async () => {
    const db = makeDb();
    await savePlaceForTraveler(fakeClient(db), USER, INPUT);
    await savePlaceForTraveler(fakeClient(db), USER, INPUT);

    expect(db.tables.destination_places).toHaveLength(1);
    // The second save reused the trip too, and added a second Ideas entry.
    expect(db.tables.trip_plans).toHaveLength(1);
    expect(db.tables.itinerary_places).toHaveLength(2);
  });

  it('reuses an existing open trip instead of creating a second one', async () => {
    const db = makeDb();
    const existing = db.insertRow('trip_plans', {
      user_id: USER, title: 'Songkran', destination: 'thailand',
      start_date: null, end_date: null, is_wishlist: false,
    });

    const result = await savePlaceForTraveler(fakeClient(db), USER, INPUT);

    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.createdTrip).toBe(false);
    expect(result.tripId).toBe(existing.id);
    expect(result.tripTitle).toBe('Songkran');
    expect(db.tables.trip_plans).toHaveLength(1);
  });

  it('ignores a trip that has already ended', async () => {
    const db = makeDb();
    db.insertRow('trip_plans', {
      user_id: USER, title: 'Last year', destination: 'Thailand',
      start_date: '2020-01-01', end_date: '2020-01-08', is_wishlist: false,
    });

    const result = await savePlaceForTraveler(fakeClient(db), USER, INPUT);

    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.createdTrip).toBe(true);
    expect(db.tables.trip_plans).toHaveLength(2);
  });

  it('asks which trip when two are open, and writes nothing', async () => {
    const db = makeDb();
    db.insertRow('trip_plans', { user_id: USER, title: 'April', destination: 'Thailand', start_date: null, end_date: null });
    db.insertRow('trip_plans', { user_id: USER, title: 'December', destination: 'Thailand', start_date: null, end_date: null });

    const before = {
      places: db.tables.destination_places.length,
      trips: db.tables.trip_plans.length,
      days: db.tables.itinerary_days.length,
      items: db.tables.itinerary_places.length,
    };

    const result = await savePlaceForTraveler(fakeClient(db), USER, INPUT);

    expect(result.status).toBe('needsChoice');
    if (result.status !== 'needsChoice') return;
    expect(result.candidates.map((trip) => trip.title)).toEqual(['April', 'December']);

    // The place row is created before the trip is resolved; nothing else moves.
    expect(db.tables.destination_places.length).toBe(before.places + 1);
    expect(db.tables.trip_plans).toHaveLength(before.trips);
    expect(db.tables.itinerary_days).toHaveLength(before.days);
    expect(db.tables.itinerary_places).toHaveLength(before.items);
  });

  it("never matches another traveler's trip", async () => {
    const db = makeDb();
    db.insertRow('trip_plans', {
      user_id: '20000000-0000-4000-8000-000000000099',
      title: 'Someone else', destination: 'Thailand', start_date: null, end_date: null,
    });

    const result = await savePlaceForTraveler(fakeClient(db), USER, INPUT);

    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;
    expect(result.createdTrip).toBe(true);
    expect(db.tables.trip_plans.filter((trip) => trip.user_id === USER)).toHaveLength(1);
  });
});
