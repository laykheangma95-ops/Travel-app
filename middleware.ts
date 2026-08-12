// ─────────────────────────────────────────────────────────────────────────────
// Edge middleware.
//
// Two jobs:
//   1. Refresh the Supabase session cookie on every request, so a signed-in
//      user's token stays valid and every server route can see it.
//   2. Gate /admin and the customer dashboard BEFORE any HTML is sent. The
//      previous gate was a React component, meaning the admin markup shipped to
//      the browser and only a client-side flag decided whether to paint it.
//
// This is defence in depth, not the boundary itself — every admin API route
// still calls requireAdmin() independently.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { classifySupabaseError, describeSupabaseError } from '@/lib/supabaseError';
import { log } from '@/lib/logger';

const ADMIN_PREFIX = '/admin';
const CUSTOMER_PREFIXES = ['/dashboard', '/my-esims', '/my-trips', '/settings'];

/**
 * Supabase stores the session in cookies named `sb-<project-ref>-auth-token`
 * (chunked as `.0`, `.1` when large) plus a PKCE verifier during OAuth.
 */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  const isCustomerRoute = CUSTOMER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase there are no sessions to refresh and no accounts to check.
  // Development stays browsable; a production deploy that reaches here has
  // bigger problems, and the API routes still refuse every admin action.
  if (!url || !anonKey) return response;

  // An anonymous visitor carries no Supabase cookie, so there is no session to
  // refresh and nothing for `getUser()` to verify. Most storefront traffic is
  // anonymous, and skipping the client entirely keeps that traffic off the
  // Supabase auth endpoint — fewer requests billed, and fewer lines of noise
  // between the failures that matter.
  if (!hasAuthCookie(request)) {
    if (isCustomerRoute) {
      const signIn = new URL('/sign-in', request.url);
      signIn.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(signIn);
    }
    if (isAdminRoute) {
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Revalidates the token and rotates the cookie when it is close to expiry.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;

  if (authError) {
    const failure = classifySupabaseError(authError);

    // A dead session is not an incident — it is a browser holding a cookie for a
    // session Supabase has forgotten. It matters because the cookie is replayed
    // on EVERY request, so one stale tab produces a steady drip of failed auth
    // calls on the Supabase dashboard. Clearing it stops the loop.
    if (failure.kind === 'stale_session') {
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith('sb-')) response.cookies.delete(cookie.name);
      }
      log.info('auth.stale_session_cleared', { path: pathname });
    } else {
      // Anything else is Supabase itself refusing us, and it was previously
      // invisible: the result was destructured for `data` only, so an outage
      // looked identical to a signed-out visitor.
      log.warn('auth.get_user_failed', {
        path: pathname,
        ...describeSupabaseError(authError),
      });
    }
  }

  if (isAdminRoute) {
    // Two ways in, checked in this order:
    //
    //   1. ADMIN_EMAIL — the owner's break-glass access, which works even when
    //      the staff table is empty or wrong.
    //   2. An active row in staff_users.
    //
    // The staff read uses the caller's OWN session against the anon key, which
    // RLS restricts to their own row (see migration 004). No service key is
    // ever present at the edge, so a middleware bug cannot enumerate staff.
    //
    // This is still only defence in depth — each /api/admin/* route re-checks
    // the specific permission it needs.
    const allowlist = adminEmails();
    const email = (user?.email ?? '').toLowerCase();
    let permitted = user !== null && allowlist.length > 0 && allowlist.includes(email);

    if (!permitted && user !== null) {
      const { data: staffRow, error: staffError } = await supabase
        .from('staff_users')
        .select('is_active')
        .eq('user_id', user.id)
        .maybeSingle();

      // Still fails closed, but no longer silently: a missing staff_users table
      // or a broken RLS policy used to look exactly like "you are not staff",
      // which is a 404 for a legitimate colleague and nothing in the log to
      // explain it.
      if (staffError) {
        log.error('auth.staff_lookup_failed', {
          path: pathname,
          ...describeSupabaseError(staffError),
        });
      }

      permitted = staffRow?.is_active === true;
    }

    if (!permitted) {
      // Deliberately indistinguishable from a missing page: an anonymous
      // visitor learns nothing about whether /admin exists. Rewriting to a
      // path with no route renders app/not-found.tsx with a real 404 status.
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }
  }

  if (isCustomerRoute && !user) {
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimization — those never
     * carry a session and paying the auth round-trip on them is wasteful.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)',
  ],
};
