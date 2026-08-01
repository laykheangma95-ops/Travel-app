// ─────────────────────────────────────────────────────────────────────────────
// Server-side authentication and authorization.
//
// WHY THIS EXISTS:
//   Admin access used to be `sessionStorage.getItem('domner-admin') === '1'`,
//   with a server check that compared a submitted email string to ADMIN_EMAIL.
//   That is not authentication — it is a client-side pixel gate plus a
//   guessable password. Anyone could type one line in devtools, and every
//   admin API route was reachable with no credential at all.
//
// THE RULE:
//   Authorization is decided on the server, from a Supabase JWT that Supabase
//   itself validates. The UI gate is now cosmetic: even with the panel forced
//   open, every admin endpoint independently re-verifies the caller.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { adminConfigured, adminEmails, isConfigured } from './env';
import { ApiError } from './http';
import { log, redactEmail } from './logger';

/** Cookie header → name/value pairs, for the Supabase SSR cookie adapter. */
function parseCookies(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return { name: part, value: '' };
      return {
        name: part.slice(0, eq).trim(),
        value: decodeURIComponent(part.slice(eq + 1).trim()),
      };
    });
}

/**
 * A Supabase client scoped to the caller's session, built from the request's
 * cookies. Uses the ANON key on purpose: this client is subject to Row Level
 * Security, so a bug here cannot leak another user's rows.
 */
export function supabaseFromRequest(request: Request): SupabaseClient | null {
  if (!isConfigured('supabase')) return null;

  const cookies = parseCookies(request.headers.get('cookie'));

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookies,
        // Route handlers here only read the session; refreshed tokens are
        // written by the middleware, which owns the response.
        setAll: () => undefined,
      },
      global: {
        headers: bearerToken(request)
          ? { Authorization: `Bearer ${bearerToken(request)}` }
          : {},
      },
    }
  );
}

/** Extracts a bearer token, for clients that send the session explicitly. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Resolves the caller to a verified user, or null.
 *
 * `getUser()` — not `getSession()` — is deliberate: it revalidates the JWT
 * against the Supabase auth server, so a forged or expired cookie fails here
 * rather than being trusted locally.
 */
export async function getUser(request: Request): Promise<User | null> {
  const supabase = supabaseFromRequest(request);
  if (!supabase) return null;

  const token = bearerToken(request);
  const { data, error } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  if (error || !data?.user) return null;
  return data.user;
}

/** Requires any signed-in user. */
export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);
  if (!user) {
    throw new ApiError('UNAUTHORIZED', 'Please sign in to continue.');
  }
  return user;
}

/** True when the email is on the ADMIN_EMAIL allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // No allowlist configured means nobody is an admin. Failing closed here is
  // what stops a fresh deploy from having a wide-open control panel.
  if (!adminConfigured()) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

/**
 * Requires a signed-in user who is on the admin allowlist.
 * Every admin API route calls this — there is no shared "already checked" flag.
 */
export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireUser(request);

  if (!isAdminEmail(user.email)) {
    log.warn('auth.admin_denied', {
      userId: user.id,
      email: redactEmail(user.email),
      allowlistConfigured: adminConfigured(),
    });
    throw new ApiError('FORBIDDEN', 'This account does not have admin access.');
  }

  log.info('auth.admin_granted', { userId: user.id, email: redactEmail(user.email) });
  return user;
}

/**
 * Server-to-server credential for scheduled jobs (flight alert cron, order
 * sweeps). Compared in constant time so the header cannot be discovered by
 * timing the response.
 */
export function verifyServiceToken(request: Request): boolean {
  const expected = process.env.DOMNER_SERVICE_TOKEN?.trim();
  if (!expected) return false;

  const provided = request.headers.get('x-domner-service-token')?.trim() ?? '';
  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Requires either an admin session or a valid service token (for cron jobs). */
export async function requireAdminOrService(request: Request): Promise<void> {
  if (verifyServiceToken(request)) return;
  await requireAdmin(request);
}
