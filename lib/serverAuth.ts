// ─────────────────────────────────────────────────────────────────────────────
// Server-side authentication and authorization.
//
// WHY THIS IS NOT IN lib/auth.ts:
//   `lib/auth.ts` is locked (docs/LOCKED.md) and is the *client* module — it
//   owns the multi-method sign-in flows that keep a traveller with no cellular
//   service able to get in. Nothing here belongs to that contract: this file
//   only answers "who is calling this route, and may they?". Keeping them in
//   separate modules means route authorization can be hardened without ever
//   reopening the locked sign-in surface.
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
import { adminConfigured, isConfigured } from './env';
import { ApiError } from './http';
import { log, redactEmail } from './logger';
import { e2eAuthEnabled, e2eSupabaseFromRequest, readE2EUserFromRequest } from './e2eAuth';
import {
  isBootstrapAdmin,
  mfaRequired,
  resolveStaff,
  roleHas,
  type Permission,
  type StaffIdentity,
} from './staff';

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
  if (e2eAuthEnabled()) return e2eSupabaseFromRequest(request);
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
  if (e2eAuthEnabled()) return readE2EUserFromRequest(request);
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

/**
 * True when the email is on the ADMIN_EMAIL break-glass allowlist.
 *
 * This is no longer the whole authorization story — staff authority lives in
 * `staff_users` — but it remains the owner's way back in when that table is
 * empty or wrong. An empty allowlist means nobody, so a fresh deploy has no
 * wide-open control panel.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  return isBootstrapAdmin(email);
}

export interface StaffSession {
  user: User;
  staff: StaffIdentity;
}

/**
 * Resolves the caller to their staff authority, or throws.
 *
 * Three ways to be refused, and they are deliberately different errors: not
 * signed in (401, go and sign in), no staff row or deactivated (403, ask an
 * admin), and MFA required but not enrolled (403, go and enrol). A single
 * "access denied" would leave a locked-out agent with nothing to act on.
 */
export async function requireStaff(request: Request): Promise<StaffSession> {
  const user = await requireUser(request);
  const staff = await resolveStaff(user.id, user.email);

  if (!staff) {
    log.warn('auth.staff_denied', {
      userId: user.id,
      email: redactEmail(user.email),
      reason: 'no_staff_record',
      allowlistConfigured: adminConfigured(),
    });
    throw new ApiError('FORBIDDEN', 'This account does not have staff access.');
  }

  if (!staff.isActive) {
    log.warn('auth.staff_denied', {
      userId: user.id,
      email: redactEmail(user.email),
      reason: 'deactivated',
    });
    throw new ApiError('FORBIDDEN', 'This staff account has been deactivated.');
  }

  if (mfaRequired() && !staff.mfaEnrolled) {
    log.warn('auth.staff_denied', {
      userId: user.id,
      email: redactEmail(user.email),
      reason: 'mfa_not_enrolled',
    });
    throw new ApiError(
      'FORBIDDEN',
      'Two-factor authentication is required for staff accounts. Enrol a second factor and sign in again.'
    );
  }

  return { user, staff };
}

/**
 * Requires a specific permission.
 *
 * Routes name the capability they need rather than the role that happens to
 * have it today, so re-cutting the roles never means editing route files.
 */
export async function requirePermission(
  request: Request,
  permission: Permission
): Promise<StaffSession> {
  const session = await requireStaff(request);

  if (!roleHas(session.staff.role, permission)) {
    log.warn('auth.permission_denied', {
      userId: session.user.id,
      email: redactEmail(session.user.email),
      role: session.staff.role,
      permission,
    });
    throw new ApiError(
      'FORBIDDEN',
      `Your role (${session.staff.role}) does not allow this. Ask an admin if you need it.`
    );
  }

  log.info('auth.permission_granted', {
    userId: session.user.id,
    role: session.staff.role,
    permission,
    viaBootstrap: session.staff.viaBootstrap,
  });

  return session;
}

/**
 * Requires the admin role specifically.
 *
 * Kept as its own function because "manage staff" is the one capability that
 * must not be delegable through the permission matrix by accident.
 */
export async function requireAdmin(request: Request): Promise<User> {
  const { user } = await requirePermission(request, 'staff.manage');
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
