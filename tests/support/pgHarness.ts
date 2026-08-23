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

-- The two other tables lib/travel/context.ts reads on every traveler load.
-- Only the columns it selects, shaped as in supabase/schema.sql. Without them
-- any suite exercising a route built on loadTravelerContext fails on a missing
-- relation rather than on the behaviour under test.
CREATE TABLE saved_flights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  flight_number TEXT NOT NULL,
  flight_date DATE NOT NULL,
  departure_airport TEXT,
  arrival_airport TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_flights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_flights_all_own" ON saved_flights FOR ALL USING (auth.uid() = user_id);

CREATE TABLE esim_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  data_gb_daily DECIMAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE esim_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esim_orders_read_own" ON esim_orders FOR SELECT USING (auth.uid() = user_id);
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

// PostgREST hands everything back as JSON, so a date reaches the app as the
// string "2026-04-10" and a numeric as a number. PGlite, being a database
// driver, decodes dates into JS Date objects and numerics into strings — both
// of which the application code would never see in production and does not
// handle. Pinning the parsers is what keeps this harness honest; without it,
// nextDayDate() receives a Date and throws RangeError on a value that works
// perfectly against the real stack.
const POSTGREST_SHAPED_PARSERS = {
  1082: (value: string) => value, // date        → "2026-04-10"
  1114: (value: string) => value, // timestamp   → ISO-ish string
  1184: (value: string) => value, // timestamptz → ISO-ish string
  1700: (value: string) => Number(value), // numeric → number
};

export async function createHarness(): Promise<Harness> {
  const db = new PGlite({ parsers: POSTGREST_SHAPED_PARSERS });
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
        `TRUNCATE itinerary_places, itinerary_days, trip_plans, destination_places, saved_flights, esim_orders, profiles, auth.users CASCADE`
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

/** One `.eq()` / `.in()` / `.or()` etc, as a SQL fragment with `?` placeholders. */
interface Filter {
  sql: string;
  params: unknown[];
}

/** A PostgREST embedded resource: `place:destination_places(*)`. */
interface Embed {
  alias: string;
  table: string;
  columns: string;
}

/**
 * Split a PostgREST select list on top-level commas, so the comma inside
 * `place:destination_places(id,name)` does not split the embed in half.
 */
function splitSelect(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of list) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(list: string): { columns: string; embeds: Embed[] } {
  const columns: string[] = [];
  const embeds: Embed[] = [];
  for (const part of splitSelect(list)) {
    const embed = /^(\w+):(\w+)\((.*)\)$/.exec(part);
    if (embed) {
      embeds.push({ alias: embed[1], table: embed[2], columns: embed[3] || '*' });
      continue;
    }
    columns.push(part);
  }
  return { columns: columns.length ? columns.join(', ') : '*', embeds };
}

function supabaseLike(db: PGlite, userId: string): SupabaseClient {
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
    const orderBy: string[] = [];
    let selection = parseSelect('*');
    let head = false;
    let wantCount = false;
    let limit: number | null = null;
    // Writes are deferred rather than built at call time, because .update() and
    // .delete() take their filters AFTER the verb.
    let pending: { kind: 'insert' | 'update' | 'delete'; row?: Record<string, unknown> } | null =
      null;
    let returning: string | null = null;

    const where = () => {
      if (!filters.length) return { clause: '', params: [] as unknown[] };
      const parts: string[] = [];
      const params: unknown[] = [];
      let index = 0;
      for (const filter of filters) {
        parts.push(filter.sql.replace(/\?/g, () => `$${(index += 1)}`));
        params.push(...filter.params);
      }
      return { clause: ` WHERE ${parts.join(' AND ')}`, params };
    };

    /** Attach each embedded resource by its `<alias>_id` foreign key. */
    const withEmbeds = async (rows: Record<string, unknown>[]) => {
      for (const embed of selection.embeds) {
        for (const row of rows) {
          const key = row[`${embed.alias}_id`];
          if (key === undefined || key === null) {
            row[embed.alias] = null;
            continue;
          }
          const joined = await run(
            `SELECT ${embed.columns} FROM ${embed.table} WHERE id = $1`,
            [key]
          );
          row[embed.alias] = joined.rows[0] ?? null;
        }
      }
      return rows;
    };

    const api = {
      select(columns?: string, options?: { count?: string; head?: boolean }) {
        if (options?.head) head = true;
        if (options?.count) wantCount = true;
        if (pending) {
          returning = columns ?? '*';
          return api;
        }
        if (columns) selection = parseSelect(columns);
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ sql: `${column} = ?`, params: [value] });
        return api;
      },
      in(column: string, values: unknown[]) {
        filters.push({ sql: `${column} = ANY(?)`, params: [values] });
        return api;
      },
      ilike(column: string, value: string) {
        filters.push({ sql: `${column} ILIKE ?`, params: [value] });
        return api;
      },
      gte(column: string, value: unknown) {
        filters.push({ sql: `${column} >= ?`, params: [value] });
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
      order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
        const direction = options?.ascending === false ? 'DESC' : 'ASC';
        // PostgREST's nullsFirst maps to Postgres's NULLS FIRST/LAST. It has to
        // be honoured rather than ignored: lib/travel/context.ts orders trips
        // `nullsFirst: false`, which is what puts undated wishlist trips at the
        // very end — and therefore first out of a LIMIT window. A harness that
        // dropped the clause would order them the opposite way and quietly fail
        // to reproduce that.
        const nulls =
          options?.nullsFirst === undefined ? '' : options.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
        orderBy.push(`${column} ${direction}${nulls}`);
        return api;
      },
      limit(count: number) {
        limit = count;
        return api;
      },
      insert(row: Record<string, unknown>) {
        pending = { kind: 'insert', row };
        return api;
      },
      update(row: Record<string, unknown>) {
        pending = { kind: 'update', row };
        return api;
      },
      delete() {
        pending = { kind: 'delete' };
        return api;
      },
      async maybeSingle() {
        const { data, error } = (await api.then((value: unknown) => value)) as {
          data: Record<string, unknown>[] | null;
          error: unknown;
        };
        if (error) return { data: null, error };
        return { data: (data ?? [])[0] ?? null, error: null };
      },
      async single() {
        const { data, error } = (await api.then((value: unknown) => value)) as {
          data: Record<string, unknown>[] | null;
          error: unknown;
        };
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
            if (pending?.kind === 'insert') {
              const keys = Object.keys(pending.row ?? {});
              const placeholders = keys.map((_, index) => `$${index + 1}`);
              const sql =
                `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})` +
                (returning ? ` RETURNING ${returning}` : '');
              const result = await run(sql, keys.map((key) => pending!.row![key]));
              return { data: result.rows ?? [], count: null, error: null };
            }

            if (pending?.kind === 'update') {
              const keys = Object.keys(pending.row ?? {});
              const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
              const { clause, params } = where();
              const shifted = clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + keys.length}`);
              const sql =
                `UPDATE ${table} SET ${assignments.join(', ')}${shifted}` +
                (returning ? ` RETURNING ${returning}` : '');
              const result = await run(sql, [...keys.map((key) => pending!.row![key]), ...params]);
              return { data: result.rows ?? [], count: null, error: null };
            }

            if (pending?.kind === 'delete') {
              const { clause, params } = where();
              const sql =
                `DELETE FROM ${table}${clause}` + (returning ? ` RETURNING ${returning}` : '');
              const result = await run(sql, params);
              return { data: result.rows ?? [], count: null, error: null };
            }

            const { clause, params } = where();
            if (head && wantCount) {
              const result = await run(`SELECT count(*)::int AS count FROM ${table}${clause}`, params);
              const first = (result.rows[0] ?? { count: 0 }) as { count: number };
              return { data: null, count: first.count, error: null };
            }

            const order = orderBy.length ? ` ORDER BY ${orderBy.join(', ')}` : '';
            const cap = limit === null ? '' : ` LIMIT ${limit}`;
            const result = await run(
              `SELECT ${selection.columns} FROM ${table}${clause}${order}${cap}`,
              params
            );
            const rows = await withEmbeds((result.rows ?? []) as Record<string, unknown>[]);
            return { data: rows, count: rows.length, error: null };
          } catch (cause) {
            // supabase-js reports a policy violation in the envelope, not by
            // throwing. Matching that is what lets the code under test behave
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
