// ─────────────────────────────────────────────────────────────────────────────
// A real Postgres, with the real policies, for tests.
//
// WHY THIS EXISTS:
//   tests/savedPlaces.test.ts uses a fake client that grants every write. That
//   proves control flow and nothing else — it cannot tell you whether the
//   database will actually accept the rows the code tries to write. Row Level
//   Security is the thing standing between "the function ran" and "the traveler
//   got their place saved", and a hand-written fake will always agree with
//   whatever the code does.
//
//   PGlite is Postgres itself compiled to WebAssembly, so the policies below are
//   enforced by the same engine Supabase runs. No daemon, no Docker, no service
//   container — it works in CI the same way it works on a laptop.
//
// WHAT IS REAL AND WHAT IS A STAND-IN:
//   REAL      — migrations 007, 009, 010 and 011 are read off disk and executed
//               verbatim. The policies under test are the SQL in git, so this
//               harness notices when they drift.
//   STAND-IN  — `auth.uid()`/`auth.role()` (copied from Supabase's own
//               definitions, reading request.jwt.claims), and the trip_plans /
//               profiles prerequisite lifted from supabase/schema.sql. Supabase
//               itself is not installable here; these are the seams.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';

// Every migration that touches these tables, in order. 008 is easy to skip and
// must not be: it is what widens the category CHECK to accept 'stay', which
// ItineraryCategory has included all along.
const MIGRATIONS = [
  '007_itinerary_planner.sql',
  '008_itinerary_readiness.sql',
  '009_custom_places.sql',
  '010_place_opening_hours.sql',
  '011_saved_places.sql',
];

/**
 * Everything migration 007 assumes already exists. Lifted from
 * supabase/schema.sql: the trip_plans shape (lines 183-198), its two policies
 * (lines 526-527), and the touch_updated_at trigger function (line 399).
 *
 * `is_wishlist` is deliberately absent — migration 011 adds it, and applying
 * that migration here is part of what is being tested.
 */
const PREREQUISITE = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (id UUID PRIMARY KEY);

-- Supabase's own definitions: the JWT is handed to Postgres as a GUC, and these
-- read the claims back out of it.
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$fn$;

CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true)::json->>'role', ''), 'anon')
$fn$;

CREATE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TABLE profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);

CREATE TABLE trip_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  travelers INTEGER DEFAULT 1,
  budget TEXT,
  interests TEXT[],
  generated_itinerary JSONB,
  cover_image_url TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_all_own"     ON trip_plans FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "trips_public_read" ON trip_plans FOR SELECT USING (is_public = TRUE);
`;

// Supabase's API roles. `authenticated` must not be a superuser or a table
// owner, or Postgres would skip every policy and the whole exercise would be
// theatre.
const ROLES = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
`;

const GRANTS = `
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
`;

export interface Harness {
  db: PGlite;
  /** A client scoped to one signed-in traveler, subject to RLS. */
  clientFor(userId: string): SupabaseClient;
  /** Create an auth user + profile so trip_plans.user_id can reference it. */
  createUser(userId: string): Promise<void>;
  /** Read a table as superuser, bypassing RLS, to assert what really landed. */
  rows(table: string): Promise<Record<string, unknown>[]>;
  /** Run SQL as the superuser — seeding, and anything RLS would refuse. */
  asAdmin(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Empty every table. Booting Postgres costs ~2s; truncating costs nothing. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const db = new PGlite();
  await db.exec(ROLES);
  await db.exec(PREREQUISITE);

  for (const file of MIGRATIONS) {
    const sql = await readFile(join(process.cwd(), 'supabase', 'migrations', file), 'utf8');
    try {
      await db.exec(sql);
    } catch (cause) {
      throw new Error(`migration ${file} failed to apply: ${(cause as Error).message}`);
    }
  }

  await db.exec(GRANTS);

  // A client call leaves the connection SET ROLE authenticated, so anything that
  // needs to see past RLS has to hand the role back first.
  const asAdmin = async (sql: string, params: unknown[] = []) => {
    await db.exec('RESET ROLE;');
    const result = await db.query(sql, params);
    return result.rows as Record<string, unknown>[];
  };

  return {
    db,
    clientFor: (userId: string) => supabaseLike(db, userId),
    async createUser(userId: string) {
      await asAdmin('INSERT INTO auth.users (id) VALUES ($1)', [userId]);
      await asAdmin('INSERT INTO profiles (id) VALUES ($1)', [userId]);
    },
    rows: (table: string) => asAdmin(`SELECT * FROM ${table}`),
    asAdmin,
    async reset() {
      await asAdmin(
        `TRUNCATE itinerary_places, itinerary_days, trip_plans, destination_places, profiles, auth.users CASCADE`
      );
    },
    close: () => db.close(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A PostgREST-shaped client over PGlite.
//
// It supports exactly the query shapes lib/travel/savedPlaces.ts uses, and
// throws on anything else rather than quietly returning a wrong answer. It also
// mirrors the one supabase-js behaviour that matters most here: a failed write
// comes back as `{ data: null, error }`, it does not throw.
// ─────────────────────────────────────────────────────────────────────────────

interface Filter {
  sql: string;
  params: unknown[];
}

function supabaseLike(db: PGlite, userId: string): SupabaseClient {
  // Every statement runs as `authenticated`, carrying this traveler's JWT
  // claims, which is what auth.uid() reads. This is the whole point: the
  // database decides what is allowed, not the test.
  //
  // SET ROLE, not SET LOCAL ROLE: outside an explicit transaction `SET LOCAL` is
  // silently a no-op, which would leave every statement running as the superuser
  // — and a superuser bypasses RLS. That mistake makes a harness that appears to
  // test policies while testing nothing at all, so it is worth being loud about.
  async function run(sql: string, params: unknown[]) {
    await db.exec(`SET ROLE authenticated;`);
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    return db.query(sql, params);
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let columns = '*';
    let head = false;
    let wantCount = false;
    let write: { sql: string; params: unknown[] } | null = null;

    const where = (offset: number) => {
      if (!filters.length) return { clause: '', params: [] as unknown[] };
      const parts: string[] = [];
      const params: unknown[] = [];
      let index = offset;
      for (const filter of filters) {
        parts.push(filter.sql.replace(/\?/g, () => `$${++index}`));
        params.push(...filter.params);
      }
      return { clause: ` WHERE ${parts.join(' AND ')}`, params };
    };

    const api = {
      select(cols?: string, options?: { count?: string; head?: boolean }) {
        if (cols) columns = cols;
        if (options?.head) head = true;
        if (options?.count) wantCount = true;
        // A select after insert/upsert is a RETURNING clause, not a new query.
        if (write) write.sql = `${write.sql} RETURNING ${cols ?? '*'}`;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ sql: `${column} = ?`, params: [value] });
        return api;
      },
      ilike(column: string, value: string) {
        filters.push({ sql: `${column} ILIKE ?`, params: [value] });
        return api;
      },
      or(expression: string) {
        const parts: string[] = [];
        const params: unknown[] = [];
        for (const clause of expression.split(',')) {
          const [column, operator, operand] = clause.split('.');
          if (operator === 'is' && operand === 'null') parts.push(`${column} IS NULL`);
          else if (operator === 'gte') {
            parts.push(`${column} >= ?`);
            params.push(operand);
          } else throw new Error(`pgHarness: unsupported or() operator "${operator}"`);
        }
        filters.push({ sql: `(${parts.join(' OR ')})`, params });
        return api;
      },
      insert(row: Record<string, unknown>) {
        const keys = Object.keys(row);
        const placeholders = keys.map((_, index) => `$${index + 1}`);
        write = {
          sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
          params: keys.map((key) => row[key]),
        };
        return api;
      },
      upsert(
        row: Record<string, unknown>,
        options: { onConflict: string; ignoreDuplicates?: boolean }
      ) {
        if (!options.ignoreDuplicates) {
          throw new Error('pgHarness: only ON CONFLICT DO NOTHING is modelled');
        }
        const keys = Object.keys(row);
        const placeholders = keys.map((_, index) => `$${index + 1}`);
        write = {
          sql:
            `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})` +
            ` ON CONFLICT (${options.onConflict}) DO NOTHING`,
          params: keys.map((key) => row[key]),
        };
        return api;
      },
      async maybeSingle() {
        const result = await api.then((value: unknown) => value);
        const { data, error } = result as { data: unknown[]; error: unknown };
        if (error) return { data: null, error };
        return { data: (data ?? [])[0] ?? null, error: null };
      },
      async single() {
        const result = await api.then((value: unknown) => value);
        const { data, error } = result as { data: unknown[]; error: unknown };
        if (error) return { data: null, error };
        const list = data ?? [];
        if (list.length !== 1) {
          return { data: null, error: { message: `expected one row, got ${list.length}` } };
        }
        return { data: list[0], error: null };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        const execute = async () => {
          try {
            if (write) {
              const result = await run(write.sql, write.params);
              return { data: result.rows ?? [], count: null, error: null };
            }
            if (head && wantCount) {
              const { clause, params } = where(0);
              const result = await run(`SELECT count(*)::int AS count FROM ${table}${clause}`, params);
              const first = (result.rows[0] ?? { count: 0 }) as { count: number };
              return { data: null, count: first.count, error: null };
            }
            const { clause, params } = where(0);
            const result = await run(`SELECT ${columns} FROM ${table}${clause}`, params);
            return { data: result.rows ?? [], count: result.rows?.length ?? 0, error: null };
          } catch (cause) {
            // supabase-js reports a policy violation in the envelope, not by
            // throwing. Matching that is what lets the module under test behave
            // here exactly as it would in production.
            return { data: null, count: null, error: { message: (cause as Error).message } };
          }
        };
        return execute().then(resolve, reject);
      },
    };

    return api;
  }

  return { from } as unknown as SupabaseClient;
}
