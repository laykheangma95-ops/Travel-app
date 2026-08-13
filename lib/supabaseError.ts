// ─────────────────────────────────────────────────────────────────────────────
// Supabase failure classification.
//
// WHY THIS EXISTS:
//   Supabase counts a failed request in its dashboard, but the app only ever
//   logged `{ error }` — the raw object, sometimes, and in several places not at
//   all. So a red number on the Supabase dashboard could not be matched to a
//   line in the Vercel log, and "14 errors in the last hour" stayed a mystery.
//
//   Every Supabase failure carries a Postgres SQLSTATE or a PostgREST code that
//   says exactly what went wrong. `42P01` means the table does not exist — a
//   migration was never applied. `42501` means RLS refused. `23505` means a
//   duplicate. Those need three different responses, and lumping them into one
//   "database error" hides the only useful part.
//
// PII:
//   PostgREST's `details` field echoes the offending row back verbatim —
//   `Key (customer_email)=(sokha@example.com) already exists`. That must never
//   reach a log drain. `describeSupabaseError` keeps code/hint/message and drops
//   details, then scrubs the `(col)=(value)` pattern out of what remains.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from './logger';

export type SupabaseFailureKind =
  /** The table is not there. A migration in supabase/migrations was never applied. */
  | 'missing_table'
  /** The column is not there. The live schema has drifted from the repo. */
  | 'missing_column'
  /** Row Level Security refused. Either the policy is wrong or the caller is. */
  | 'rls_denied'
  /** The caller's JWT expired or was rejected. Not a server fault. */
  | 'jwt_invalid'
  /** A stored refresh token no longer exists — a stale cookie replaying a dead session. */
  | 'stale_session'
  /** Wrong email/password, wrong OTP. Expected, and the customer's to fix. */
  | 'bad_credentials'
  /** Unique constraint. Usually an idempotent replay, not an incident. */
  | 'duplicate'
  /** Foreign key, not-null or check constraint — the app sent something invalid. */
  | 'invalid_data'
  /** Statement or connection timed out. Retryable. */
  | 'timeout'
  /** Connection refused, too many connections, database paused. Retryable. */
  | 'unavailable'
  /** `.single()` matched no rows. Frequently an expected "not found". */
  | 'no_rows'
  | 'unknown';

export interface SupabaseFailure {
  kind: SupabaseFailureKind;
  /** SQLSTATE (`23505`) or PostgREST code (`PGRST116`), when the error carried one. */
  code: string | null;
  /** HTTP status Supabase returned, when the error carried one. */
  status: number | null;
  /** True when trying the same call again could plausibly succeed. */
  retryable: boolean;
  /**
   * True when the cause is our configuration or our code, not the caller's
   * input. These are the ones worth paging about.
   */
  ourFault: boolean;
  /** What an operator should actually do about it. Written for a non-DBA. */
  operatorHint: string;
  /** Scrubbed message, safe to put in a log line. */
  message: string;
}

interface RawSupabaseError {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  hint?: unknown;
  name?: unknown;
}

/**
 * Strips the values Postgres helpfully pastes into constraint messages:
 * `Key (customer_email)=(sokha@example.com) already exists` becomes
 * `Key (customer_email)=(***) already exists`.
 */
function scrubValues(message: string): string {
  return message.replace(/=\(([^)]*)\)/g, '=(***)');
}

const KIND_BY_CODE: Record<string, SupabaseFailureKind> = {
  // Postgres SQLSTATE
  '42P01': 'missing_table',
  '42703': 'missing_column',
  '42501': 'rls_denied',
  '23505': 'duplicate',
  '23503': 'invalid_data',
  '23502': 'invalid_data',
  '23514': 'invalid_data',
  '22P02': 'invalid_data',
  '57014': 'timeout',
  '53300': 'unavailable',
  '08006': 'unavailable',
  '08003': 'unavailable',
  // PostgREST
  PGRST116: 'no_rows',
  PGRST204: 'missing_column',
  PGRST205: 'missing_table',
  PGRST301: 'jwt_invalid',
  PGRST302: 'jwt_invalid',
};

const HINTS: Record<SupabaseFailureKind, string> = {
  missing_table:
    'The table does not exist in this Supabase project. Apply supabase/migrations — the dashboard reports "No migrations", so the live schema may never have been migrated from the repo.',
  missing_column:
    'The live schema has drifted from supabase/migrations. Add the column with an additive migration; never edit the table in the dashboard.',
  rls_denied:
    'Row Level Security refused this. Either the policy is missing for this role, or a server path is using the anon key where it needs the service role.',
  jwt_invalid: 'The caller signed in too long ago. The client should refresh or sign in again.',
  stale_session:
    'A browser is replaying a session that no longer exists. Its auth cookie should be cleared so it stops retrying on every request.',
  bad_credentials: 'Wrong password or wrong code. Nothing to fix on our side.',
  duplicate:
    'A unique constraint blocked the write. Usually a replayed webhook or a double-submitted form — check idempotency before treating it as a bug.',
  invalid_data:
    'The row we sent violates a constraint. This is an application bug, not a database fault.',
  timeout:
    'The query ran out of time. Check for a missing index, or that the Nano instance is not saturated.',
  unavailable:
    'The database refused the connection — paused, restarting, or out of connection slots.',
  no_rows: 'The query matched nothing. Often an expected "not found" rather than a failure.',
  unknown: 'Unrecognised Supabase failure. The raw code is in the log line.',
};

const RETRYABLE: SupabaseFailureKind[] = ['timeout', 'unavailable'];

/** Failures caused by our schema, our config or our code — as opposed to the caller's. */
const OUR_FAULT: SupabaseFailureKind[] = [
  'missing_table',
  'missing_column',
  'rls_denied',
  'invalid_data',
  'timeout',
  'unavailable',
];

function kindFromMessage(message: string, status: number | null): SupabaseFailureKind {
  const text = message.toLowerCase();
  if (text.includes('refresh token') || text.includes('session missing')) return 'stale_session';
  if (text.includes('invalid login credentials') || text.includes('otp') || text.includes('token has expired')) {
    return 'bad_credentials';
  }
  if (text.includes('jwt') || text.includes('invalid claim')) return 'jwt_invalid';
  if (text.includes('row-level security') || text.includes('row level security')) return 'rls_denied';
  if (text.includes('fetch failed') || text.includes('econnrefused') || text.includes('network')) {
    return 'unavailable';
  }
  if (text.includes('timeout') || text.includes('timed out')) return 'timeout';
  if (status === 401 || status === 403) return 'rls_denied';
  if (status === 404) return 'missing_table';
  if (status !== null && status >= 500) return 'unavailable';
  return 'unknown';
}

/**
 * Turns anything Supabase throws or returns — PostgrestError, AuthError, a
 * plain fetch failure — into one classified, log-safe shape.
 */
export function classifySupabaseError(error: unknown): SupabaseFailure {
  const raw = (error ?? {}) as RawSupabaseError;

  const code = typeof raw.code === 'string' && raw.code.length > 0 ? raw.code : null;
  const status = typeof raw.status === 'number' ? raw.status : null;
  const rawMessage =
    typeof raw.message === 'string' && raw.message.length > 0 ? raw.message : 'Unknown error';

  const kind: SupabaseFailureKind =
    (code !== null ? KIND_BY_CODE[code] : undefined) ?? kindFromMessage(rawMessage, status);

  return {
    kind,
    code,
    status,
    retryable: RETRYABLE.includes(kind),
    ourFault: OUR_FAULT.includes(kind),
    operatorHint: HINTS[kind],
    message: scrubValues(rawMessage),
  };
}

/**
 * The fields to spread into a log line. Deliberately omits PostgREST's
 * `details`, which echoes row values.
 */
export function describeSupabaseError(error: unknown): Record<string, unknown> {
  const failure = classifySupabaseError(error);
  return {
    dbKind: failure.kind,
    dbCode: failure.code,
    dbStatus: failure.status,
    dbMessage: failure.message,
    dbHint: failure.operatorHint,
    dbRetryable: failure.retryable,
  };
}

/**
 * Logs a Supabase failure at a level that matches whose fault it is: our schema
 * being wrong is an error, a customer typing the wrong password is not. Returns
 * the classification so the caller can branch on it.
 */
export function logSupabaseError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {}
): SupabaseFailure {
  const failure = classifySupabaseError(error);
  const level = failure.ourFault ? 'error' : 'warn';
  log[level](event, { ...fields, ...describeSupabaseError(error) });
  return failure;
}

/** A message that is safe to render to a customer. Never leaks schema detail. */
export function customerSafeMessage(error: unknown): string {
  const { kind } = classifySupabaseError(error);
  switch (kind) {
    case 'bad_credentials':
      return 'That email or code was not right. Please try again.';
    case 'stale_session':
    case 'jwt_invalid':
      return 'Your session has expired. Please sign in again.';
    case 'timeout':
    case 'unavailable':
      return 'We could not reach our system just now. Please try again in a moment.';
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}
