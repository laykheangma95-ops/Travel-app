// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 — the sort_order collision that produced "0 Saved / 1 could not
// be saved" on a real, already-organised trip.
//
// tests/savedPlaces.test.ts already proves addIdeaToTrip's control flow with a
// fake client that grants every write. This file is that same fake, extended
// with the two things the investigation needed and the old fake did not model:
// a sort_order-aware `.order()/.limit()` (so `nextSortOrder` gets a real
// answer instead of throwing) and scriptable insert failures (so a 23505 can
// actually be forced, rather than merely reasoned about).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addIdeaToTrip } from '@/lib/travel/savedPlaces';

type Row = Record<string, unknown>;
type ScriptedError = { code: string; message: string };

function fakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    trip_plans: [],
    destination_places: [],
    itinerary_days: [],
    itinerary_places: [],
  };
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));

  // One queued failure per table, consumed by the next insert into it. This is
  // what stands in for "a concurrent writer claimed this exact sort_order
  // first" — a real 23505, not a fabricated one — without needing genuine
  // concurrency in a single-threaded test.
  const queuedInsertErrors: Record<string, ScriptedError[]> = {};
  const failNextInsert = (table: string, error: ScriptedError) => {
    (queuedInsertErrors[table] ??= []).push(error);
  };

  let counter = 0;
  const nextId = () => `generated-${++counter}`;

  function from(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: Array<(row: Row) => boolean> = [];
    let written: Row[] | null = null;
    let writeError: ScriptedError | null = null;
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
      order(column: string, options?: { ascending?: boolean }) {
        orderBy = { column, ascending: options?.ascending !== false };
        return api;
      },
      limit(count: number) {
        limitTo = count;
        return api;
      },
      insert(row: Row) {
        const queued = queuedInsertErrors[table]?.shift();
        if (queued) {
          writeError = queued;
          written = [];
          return api;
        }
        // The real destination_places_owner_name_idx / itinerary_places'
        // UNIQUE(itinerary_day_id, sort_order) — enough of it to make the
        // scripted-failure tests below meaningful without a full Postgres.
        if (table === 'itinerary_places') {
          const collision = rows().find(
            (existing) =>
              existing.itinerary_day_id === row.itinerary_day_id && existing.sort_order === row.sort_order
          );
          if (collision) {
            writeError = { code: '23505', message: 'duplicate key value violates unique constraint' };
            written = [];
            return api;
          }
        }
        const created = { id: nextId(), ...row };
        rows().push(created);
        written = [created];
        return api;
      },
      maybeSingle() {
        if (writeError) return Promise.resolve({ data: null, error: writeError });
        return Promise.resolve({ data: matched()[0] ?? null, error: null });
      },
      single() {
        if (writeError) return Promise.resolve({ data: null, error: writeError });
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

  return { client: { from } as unknown as SupabaseClient, tables, failNextInsert };
}

const USER = 'user-1';

describe('addIdeaToTrip — sort_order collisions (Phase 13.5)', () => {
  it('A: fills a gap with MAX(sort_order)+1, not COUNT(*) — gap at {0,2} gets 3, never collides with 2', async () => {
    const { client, tables } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Trip', destination: 'Vietnam' }],
      itinerary_days: [{ id: 'day-0', trip_id: 'trip-1', day_index: 0 }],
      // A gap: row at sort_order 1 is gone (deleted or moved elsewhere).
      // COUNT(*) here is 2, and inserting at sort_order 2 would collide with
      // the row still sitting there.
      itinerary_places: [
        { id: 'ip-1', itinerary_day_id: 'day-0', place_id: 'place-a', sort_order: 0, category: 'spot' },
        { id: 'ip-2', itinerary_day_id: 'day-0', place_id: 'place-b', sort_order: 2, category: 'spot' },
      ],
      destination_places: [{ id: 'place-new', destination: 'Vietnam', category: 'food' }],
    });

    await addIdeaToTrip(client, 'trip-1', 'place-new');

    const added = tables.itinerary_places.find((row) => row.place_id === 'place-new');
    expect(added?.sort_order).toBe(3);
  });

  it('B: the exact reported shape — Ideas {0,1,2} loses row 1 to a move, then an import must not 23505 at slot 2', async () => {
    const { client, tables } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Ho Chi Minh City trip', destination: 'Vietnam' }],
      itinerary_days: [{ id: 'day-0', trip_id: 'trip-1', day_index: 0 }],
      itinerary_places: [
        { id: 'ip-1', itinerary_day_id: 'day-0', place_id: 'place-a', sort_order: 0, category: 'spot' },
        { id: 'ip-2', itinerary_day_id: 'day-0', place_id: 'place-c', sort_order: 2, category: 'spot' },
        // row that WAS sort_order 1 has moved to another day — Ideas is left
        // with a gap, exactly what a `move` action produces today.
      ],
      destination_places: [{ id: 'place-lau2', destination: 'Vietnam', category: 'food' }],
    });

    await expect(addIdeaToTrip(client, 'trip-1', 'place-lau2')).resolves.toBeTruthy();
    expect(tables.itinerary_places).toHaveLength(3);
    const sortOrders = tables.itinerary_places.map((row) => row.sort_order).sort();
    expect(new Set(sortOrders).size).toBe(3); // no duplicate slot
  });

  it('C: one 23505 from a concurrent writer is retried once against a freshly-read MAX, and succeeds', async () => {
    const { client, tables, failNextInsert } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Trip', destination: 'Vietnam' }],
      itinerary_days: [{ id: 'day-0', trip_id: 'trip-1', day_index: 0 }],
      itinerary_places: [
        { id: 'ip-1', itinerary_day_id: 'day-0', place_id: 'place-a', sort_order: 0, category: 'spot' },
      ],
      destination_places: [{ id: 'place-new', destination: 'Vietnam', category: 'food' }],
    });

    // First attempt at sort_order 1 loses a race to a concurrent writer.
    failNextInsert('itinerary_places', { code: '23505', message: 'duplicate key value violates unique constraint' });

    await addIdeaToTrip(client, 'trip-1', 'place-new');

    const added = tables.itinerary_places.find((row) => row.place_id === 'place-new');
    expect(added).toBeTruthy();
  });

  it('C (bounded): a second 23505 after the retry is a real, reportable failure — not a second retry', async () => {
    const { client, failNextInsert } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Trip', destination: 'Vietnam' }],
      itinerary_days: [{ id: 'day-0', trip_id: 'trip-1', day_index: 0 }],
      itinerary_places: [],
      destination_places: [{ id: 'place-new', destination: 'Vietnam', category: 'food' }],
    });

    failNextInsert('itinerary_places', { code: '23505', message: 'duplicate key value violates unique constraint' });
    failNextInsert('itinerary_places', { code: '23505', message: 'duplicate key value violates unique constraint' });

    await expect(addIdeaToTrip(client, 'trip-1', 'place-new')).rejects.toMatchObject({
      code: 'INTERNAL',
      details: { reason: 'itinerary_conflict' },
    });
  });

  it('H: a persistent conflict is classified, not a bare "could not be saved" — no SQLSTATE or constraint name in the message', async () => {
    const { client, failNextInsert } = fakeSupabase({
      trip_plans: [{ id: 'trip-1', user_id: USER, title: 'Trip', destination: 'Vietnam' }],
      itinerary_days: [{ id: 'day-0', trip_id: 'trip-1', day_index: 0 }],
      itinerary_places: [],
      destination_places: [{ id: 'place-new', destination: 'Vietnam', category: 'food' }],
    });

    failNextInsert('itinerary_places', { code: '23505', message: 'duplicate key value violates unique constraint "itinerary_places_itinerary_day_id_sort_order_key"' });
    failNextInsert('itinerary_places', { code: '23505', message: 'duplicate key value violates unique constraint "itinerary_places_itinerary_day_id_sort_order_key"' });

    try {
      await addIdeaToTrip(client, 'trip-1', 'place-new');
      expect.unreachable('addIdeaToTrip should have thrown');
    } catch (cause) {
      const error = cause as { details?: { reason?: string }; message: string };
      expect(error.details?.reason).toBe('itinerary_conflict');
      expect(error.message).not.toMatch(/23505/);
      expect(error.message).not.toMatch(/constraint/i);
    }
  });
});
