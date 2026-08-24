// ─────────────────────────────────────────────────────────────────────────────
// A Supabase query builder that answers from a function instead of a database.
//
// The PGlite harness (tests/support/pgHarness.ts) is the right tool when the
// question is "what does Postgres do" — RLS, constraints, cascades. It is the
// wrong tool when the question is "what does our code do when a query FAILS",
// because a healthy database cannot be asked to fail on demand, and those
// failure branches are exactly where the trip screens went wrong.
//
// So this records each call and hands it to a per-test answer function. It
// implements only the builder surface the travel code actually uses; anything
// else should be added here rather than worked around in a test.
// ─────────────────────────────────────────────────────────────────────────────

/** One query, as the fake saw it. */
export interface FakeQuery {
  table: string;
  /** 'select' unless the call went through insert/update/delete. */
  op: 'select' | 'insert' | 'update' | 'delete';
  columns: string;
  /** Every .eq()/.is() applied, by column. */
  filters: Record<string, unknown>;
  /** The row (or rows) handed to .insert(). */
  inserted?: Record<string, unknown> | Record<string, unknown>[];
  /** The patch handed to .update(). */
  updated?: Record<string, unknown>;
}

export interface FakeAnswer {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export type Answering = (query: FakeQuery) => FakeAnswer;

export const okData = (data: unknown): FakeAnswer => ({ data, error: null });
export const failsWith = (code: string, message: string): FakeAnswer => ({
  data: null,
  error: { code, message },
});

export interface FakeSupabase {
  /** Pass where a SupabaseClient is expected. */
  client: unknown;
  /** Every query issued, in order. */
  seen: FakeQuery[];
  /** Swap the answer function between tests. */
  answer: Answering;
}

export function createFakeSupabase(answer: Answering): FakeSupabase {
  const state: FakeSupabase = {
    answer,
    seen: [],
    client: null,
  };

  state.client = {
    from(table: string) {
      const query: FakeQuery = { table, op: 'select', columns: '', filters: {} };
      const builder: Record<string, unknown> = {
        select(columns: string) {
          query.columns = columns;
          return builder;
        },
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          query.op = 'insert';
          query.inserted = rows;
          return builder;
        },
        update(patch: Record<string, unknown>) {
          query.op = 'update';
          query.updated = patch;
          return builder;
        },
        delete() {
          query.op = 'delete';
          return builder;
        },
        eq(column: string, value: unknown) {
          query.filters[column] = value;
          return builder;
        },
        is(column: string, value: unknown) {
          query.filters[column] = value;
          return builder;
        },
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => builder,
        maybeSingle: () => builder,
        then(resolve: (value: FakeAnswer) => unknown, reject: (reason: unknown) => unknown) {
          state.seen.push(query);
          return Promise.resolve(state.answer(query)).then(resolve, reject);
        },
      };
      return builder;
    },
  };

  return state;
}
