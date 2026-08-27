'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { getSupabase } from '@/lib/supabase';
import {
  authCallbackBusyCopy,
  consumeReturnTo,
  friendlyAuthError,
  readServerAuthStatus,
  setReturnTo,
} from '@/lib/auth';
import { readReturnTo } from '@/lib/authRouting';

const CALLBACK_TIMEOUT_MS = 10_000;
const CALLBACK_POLL_MS = 250;
const SLOW_CALLBACK_MS = 1_500;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Landing page for Google/Apple redirects and email confirmation links.
 * supabase-js can read the session out of the URL itself (detectSessionInUrl),
 * but the browser cookie the server depends on is allowed to lag behind that by
 * a beat — especially on Safari and installed PWAs. So this page waits for the
 * SERVER to see the signed-in user before it forwards them to a protected route.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const busy = authCallbackBusyCopy();

  useEffect(() => {
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlow(true);
    }, SLOW_CALLBACK_MS);

    const finish = () => router.replace(consumeReturnTo());

    const run = async () => {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const returnTo = readReturnTo(search);
      if (returnTo) setReturnTo(returnTo);

      const explicitError = friendlyAuthError(
        search.get('error_description') ??
          hash.get('error_description') ??
          search.get('error') ??
          hash.get('error')
      );
      if (explicitError) {
        setError(explicitError);
        return;
      }

      const supabase = getSupabase();
      if (!supabase) {
        finish();
        return;
      }

      const startedAt = Date.now();
      let sawAuthMaterial =
        search.has('code') ||
        search.has('token_hash') ||
        search.has('type') ||
        hash.has('access_token') ||
        hash.has('refresh_token');

      while (!cancelled && Date.now() - startedAt < CALLBACK_TIMEOUT_MS) {
        const [server, session] = await Promise.allSettled([
          readServerAuthStatus(),
          supabase.auth.getSession(),
        ]);
        if (cancelled) return;

        if (server.status === 'fulfilled' && server.value.signedIn) {
          finish();
          return;
        }

        if (session.status === 'fulfilled') {
          if (session.value.error) {
            const friendly = friendlyAuthError(session.value.error.message);
            if (friendly && friendly !== 'auth.error.network') {
              setError(friendly);
              return;
            }
          }
          if (session.value.data.session) sawAuthMaterial = true;
        }

        await pause(CALLBACK_POLL_MS);
      }

      if (cancelled) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('auth.error.network');
        return;
      }
      if (search.get('type') === 'recovery') {
        setError('auth.error.recoveryExpired');
        return;
      }
      setError(sawAuthMaterial ? 'auth.error.callbackSync' : 'auth.error.callbackExpired');
    };

    void run().finally(() => window.clearTimeout(slowTimer));

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [router]);

  return (
    <AuthCard title={busy.title} subtitle={slow ? busy.detail : busy.subtitle}>
      <div className="flex flex-col items-center py-6 text-center">
        {error ? (
          <>
            <AuthError message={error} />
            <button
              type="button"
              onClick={() => router.replace('/sign-in')}
              className="mt-4 text-sm font-semibold text-secondary hover:text-accent"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <Loader2 size={26} className="animate-spin text-ink-muted" aria-hidden="true" />
            {slow && <p className="mt-4 text-sm text-ink-secondary">{busy.detail}</p>}
          </>
        )}
      </div>
    </AuthCard>
  );
}
