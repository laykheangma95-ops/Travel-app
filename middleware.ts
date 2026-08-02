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

const ADMIN_PREFIX = '/admin';
const CUSTOMER_PREFIXES = ['/dashboard', '/my-esims', '/my-trips', '/settings'];

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAdminRoute) {
    const allowlist = adminEmails();
    const permitted =
      user !== null && allowlist.length > 0 && allowlist.includes((user.email ?? '').toLowerCase());

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
