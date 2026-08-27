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
import { E2E_AUTH_COOKIE, e2eAuthEnabled, e2eCallbackCookieValue, readE2EUserFromRequest } from '@/lib/e2eAuth';
import {
  applyReturnTo,
  AUTH_RETURN_TO_COOKIE,
  AUTH_RETURN_TO_MAX_AGE_SECONDS,
  currentPathWithSearch,
  DEFAULT_AUTH_RETURN_TO,
  isAdminRoute,
  isProtectedCustomerRoute,
  normalizeReturnTo,
  readReturnTo,
} from '@/lib/authRouting';
import { log } from '@/lib/logger';
import { demoModeAllowed } from '@/lib/env';
import type { EmailOtpType } from '@supabase/supabase-js';

const AUTH_CALLBACK_PATH = '/auth/callback';
const CALLBACK_TYPES = new Set<EmailOtpType>([
  'email',
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
]);

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

function callbackType(type: string | null): EmailOtpType | null {
  if (!type || !CALLBACK_TYPES.has(type as EmailOtpType)) return null;
  return type as EmailOtpType;
}

function signInRedirect(request: NextRequest): URL {
  const signIn = new URL('/sign-in', request.url);
  return applyReturnTo(
    signIn,
    normalizeReturnTo(currentPathWithSearch(request.nextUrl.pathname, request.nextUrl.search), '')
  );
}

function setReturnToCookie(
  request: NextRequest,
  response: NextResponse,
  value: string | null | undefined
): void {
  const normalized = normalizeReturnTo(value, '');
  if (!normalized) {
    response.cookies.delete(AUTH_RETURN_TO_COOKIE);
    return;
  }

  response.cookies.set({
    name: AUTH_RETURN_TO_COOKIE,
    value: normalized,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    maxAge: AUTH_RETURN_TO_MAX_AGE_SECONDS,
  });
}

function clearReturnToCookie(request: NextRequest, response: NextResponse): void {
  response.cookies.set({
    name: AUTH_RETURN_TO_COOKIE,
    value: '',
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    maxAge: 0,
  });
}

function redirectToSignIn(request: NextRequest): NextResponse {
  const returnTo = normalizeReturnTo(
    currentPathWithSearch(request.nextUrl.pathname, request.nextUrl.search),
    ''
  );
  const response = NextResponse.redirect(signInRedirect(request));
  setReturnToCookie(request, response, returnTo);
  return response;
}

async function handleAuthCallback(
  request: NextRequest,
  url: string,
  anonKey: string
): Promise<NextResponse> {
  const returnTo = readReturnTo(request.nextUrl.searchParams);
  const type = callbackType(request.nextUrl.searchParams.get('type'));
  const successDestination =
    type === 'recovery'
      ? applyReturnTo(new URL('/reset-password', request.url), returnTo)
      : new URL(normalizeReturnTo(returnTo, DEFAULT_AUTH_RETURN_TO), request.url);
  const errorDestination = applyReturnTo(
    new URL(type === 'recovery' ? '/reset-password' : AUTH_CALLBACK_PATH, request.url),
    returnTo
  );
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.redirect(successDestination);
        if (type === 'recovery') {
          setReturnToCookie(request, response, returnTo);
        } else {
          clearReturnToCookie(request, response);
        }
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const code = request.nextUrl.searchParams.get('code');
  const flowId = request.nextUrl.searchParams.get('sb_flow_id');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  let response = NextResponse.redirect(successDestination);
  if (type === 'recovery') {
    setReturnToCookie(request, response, returnTo);
  } else {
    clearReturnToCookie(request, response);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined
    );
    if (error) {
      log.warn('auth.callback_exchange_failed', {
        path: request.nextUrl.pathname,
        ...describeSupabaseError(error),
      });
      errorDestination.searchParams.set('error_description', error.message);
      response = NextResponse.redirect(errorDestination);
      setReturnToCookie(request, response, returnTo);
    }
    return response;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      log.warn('auth.callback_verify_failed', {
        path: request.nextUrl.pathname,
        type,
        ...describeSupabaseError(error),
      });
      errorDestination.searchParams.set('error_description', error.message);
      response = NextResponse.redirect(errorDestination);
      setReturnToCookie(request, response, returnTo);
    }
  }

  return response;
}

function handleE2EAuthCallback(request: NextRequest): NextResponse {
  const returnTo = readReturnTo(request.nextUrl.searchParams);
  const destination = new URL(normalizeReturnTo(returnTo, DEFAULT_AUTH_RETURN_TO), request.url);
  const response = NextResponse.redirect(destination);
  clearReturnToCookie(request, response);

  const code = request.nextUrl.searchParams.get('code');
  const sessionCookie = code ? e2eCallbackCookieValue(code) : null;
  if (!sessionCookie) {
    const failed = applyReturnTo(new URL(AUTH_CALLBACK_PATH, request.url), returnTo);
    failed.searchParams.set('error_description', 'Email link is invalid or has expired');
    const errorResponse = NextResponse.redirect(failed);
    setReturnToCookie(request, errorResponse, returnTo);
    return errorResponse;
  }

  response.cookies.set({
    name: E2E_AUTH_COOKIE,
    value: sessionCookie,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminRoute = isAdminRoute(pathname);
  const customerRoute = isProtectedCustomerRoute(pathname);
  // Only the dashboard root redirects staff onward. Deeper customer pages
  // (/my-esims, /settings) are places staff may legitimately want to be.
  const isCustomerDashboard = pathname === '/dashboard';

  let response = NextResponse.next({ request });

  if (e2eAuthEnabled()) {
    if (pathname === AUTH_CALLBACK_PATH && request.nextUrl.searchParams.has('code')) {
      return handleE2EAuthCallback(request);
    }

    const user = readE2EUserFromRequest(request);

    if (adminRoute) {
      if (!user) return redirectToSignIn(request);
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }

    if (customerRoute && !user) {
      return redirectToSignIn(request);
    }

    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase there are no sessions to refresh and no accounts to check.
  //
  // Development stays browsable, as it always has. Production does NOT: an
  // outage must not present as an open door. Waving every request through here
  // meant that a deploy missing the anon key served /dashboard, /my-esims,
  // /my-trips and /settings to anyone with the URL — and left /admin ungated at
  // the edge too, since this early return sat in front of the admin check. The
  // API routes still refused every admin action, but the pages themselves
  // rendered. Deny instead, and let the operator find it in the logs.
  if (!url || !anonKey) {
    if (demoModeAllowed) return response;

    console.error(
      '[middleware] Supabase is not configured on a production deploy. ' +
        'Denying gated routes. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.'
    );

    if (adminRoute) {
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }
    if (customerRoute) {
      return redirectToSignIn(request);
    }
    // The public site — storefront, destinations, checkout — is untouched.
    return response;
  }

  if (pathname === AUTH_CALLBACK_PATH) {
    const search = request.nextUrl.searchParams;
    if (search.has('code') || (search.has('token_hash') && callbackType(search.get('type')))) {
      return handleAuthCallback(request, url, anonKey);
    }
  }

  // An anonymous visitor carries no Supabase cookie, so there is no session to
  // refresh and nothing for `getUser()` to verify. Most storefront traffic is
  // anonymous, and skipping the client entirely keeps that traffic off the
  // Supabase auth endpoint — fewer requests billed, and fewer lines of noise
  // between the failures that matter.
  if (!hasAuthCookie(request)) {
    if (customerRoute) {
      return redirectToSignIn(request);
    }
    // No cookie means nobody is signed in, which is the same case the admin
    // gate below answers with a sign-in redirect. It has to answer it the same
    // way here: this early return sits in front of that check, so returning a
    // 404 would quietly restore the behaviour that told staff arriving from a
    // bookmark that the panel did not exist.
    if (adminRoute) {
      return redirectToSignIn(request);
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

  if (adminRoute) {
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
      // Two different refusals, because the people hitting them are different.
      //
      // NOT SIGNED IN — send them to sign in and bring them back. Staff arrive
      // at /admin from a bookmark or a link with no session yet, and a 404 told
      // them the panel was gone rather than that they needed to log in. The
      // cost is that an anonymous visitor can now tell /admin exists. That is a
      // deliberate trade the owner made: the path is guessable on any site, so
      // hiding it bought little, while locking out staff cost real time.
      if (user === null) {
        return redirectToSignIn(request);
      }

      // SIGNED IN, BUT NOT STAFF — still a 404, and this is the case worth
      // keeping secret. A customer poking at /admin learns nothing, so the
      // panel's existence is not advertised to the people most likely to try.
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }
  }

  // Staff land in the panel, not on the customer dashboard.
  //
  // Signing in drops everyone on /dashboard, which for the owner is the wrong
  // room — their work is in /admin. Redirect here rather than in the sign-in
  // page because that page is locked (docs/LOCKED.md) and this keeps the whole
  // decision in one place that already knows who is staff.
  //
  // `?customer=1` opts out, so the owner can still see exactly what a traveller
  // sees. Without an escape hatch this would make the customer dashboard
  // unreachable for the one person most likely to need to inspect it.
  if (isCustomerDashboard && user !== null && request.nextUrl.searchParams.get('customer') !== '1') {
    const allowlist = adminEmails();
    const email = (user.email ?? '').toLowerCase();
    let isStaff = allowlist.length > 0 && allowlist.includes(email);

    if (!isStaff) {
      const { data: staffRow } = await supabase
        .from('staff_users')
        .select('is_active')
        .eq('user_id', user.id)
        .maybeSingle();

      isStaff = staffRow?.is_active === true;
    }

    if (isStaff) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (customerRoute && !user) {
    return redirectToSignIn(request);
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
