'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SignInLink — a link to sign-in that actually comes back.
//
// WHAT WAS WRONG:
//   Nine screens linked to `/sign-in?returnTo=/somewhere`. The sign-in and
//   sign-up pages finish by calling `consumeReturnTo()`, which reads the path
//   from `sessionStorage` — not from the query string. `setReturnTo()`, the only
//   function that writes that key, was never called anywhere in the codebase.
//
//   So every one of those journeys silently dropped the traveler on the
//   fallback route instead of the trip, the order, or the settings screen they
//   were trying to reach.
//
// WHY IT IS FIXED HERE AND NOT IN lib/auth.ts:
//   `lib/auth.ts` and both auth pages are LOCKED (docs/LOCKED.md). This needs no
//   change to either: `setReturnTo` is already exported and already correct, and
//   `consumeReturnTo` already reads what it writes. The only missing piece was a
//   caller, and callers live in unlocked files.
//
//   This component is that caller. It writes the destination on click, then
//   navigates. The `?returnTo=` query parameter stays on the href so the URL
//   remains self-describing and shareable, but the session value is what the
//   auth pages actually read.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { setReturnTo } from '@/lib/auth';

interface SignInLinkProps {
  /** Where to land after signing in. An in-app path, never an absolute URL. */
  returnTo: string;
  children: React.ReactNode;
  className?: string;
  /** Send the traveler to sign-up rather than sign-in. */
  signUp?: boolean;
}

/**
 * Only same-origin paths are accepted. A returnTo that could point off-site
 * would turn every sign-in link into an open redirect.
 */
function safePath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export function SignInLink({ returnTo, children, className, signUp = false }: SignInLinkProps) {
  const destination = safePath(returnTo);
  const base = signUp ? '/sign-up' : '/sign-in';

  return (
    <Link
      href={`${base}?returnTo=${encodeURIComponent(destination)}`}
      onClick={() => setReturnTo(destination)}
      className={className}
    >
      {children}
    </Link>
  );
}
