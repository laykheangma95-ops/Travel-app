'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { getSupabase } from '@/lib/supabase';
import { consumeReturnTo } from '@/lib/auth';

/**
 * Landing page for Google/Apple redirects and email confirmation links.
 * supabase-js reads the session out of the URL itself (detectSessionInUrl),
 * so all we do here is wait for it and forward the user on.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace(consumeReturnTo());
      return;
    }

    let cancelled = false;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      if (data.session) {
        router.replace(consumeReturnTo());
        return;
      }
      // No session in the URL — the link was already used or has expired.
      setError('That sign-in link is no longer valid. Please request a new one.');
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AuthCard title="Signing you in" subtitle="One moment…">
      <div className="flex flex-col items-center py-6 text-center">
        {error ? (
          <>
            <p role="alert" className="rounded-btn bg-red-50 p-3 text-sm text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={() => router.replace('/sign-in')}
              className="mt-4 text-sm font-semibold text-secondary hover:text-accent"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <Loader2 size={26} className="animate-spin text-ink-muted" aria-hidden="true" />
        )}
      </div>
    </AuthCard>
  );
}
