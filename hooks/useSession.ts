'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export interface SessionState {
  user: User | null;
  /** Server-verified. Never derived from the email in the browser. */
  isAdmin: boolean;
  loading: boolean;
  /** True when Supabase is not configured — development / demo mode. */
  unconfigured: boolean;
  signOut: () => Promise<void>;
}

/**
 * The signed-in user, plus a server-verified admin flag.
 *
 * The admin answer deliberately comes from `/api/admin/session` rather than
 * being computed here: a browser cannot be trusted to decide it is an admin,
 * and every admin endpoint re-checks anyway. This hook only decides what UI to
 * paint.
 */
export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabase();
  const unconfigured = supabase === null;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    const resolveAdmin = async (nextUser: User | null) => {
      if (!nextUser) {
        if (active) setIsAdmin(false);
        return;
      }
      try {
        const res = await fetch('/api/admin/session', { credentials: 'include' });
        const data = (await res.json()) as { admin?: boolean };
        if (active) setIsAdmin(res.ok && data.admin === true);
      } catch {
        if (active) setIsAdmin(false);
      }
    };

    // getUser() revalidates the token with Supabase rather than trusting the
    // locally cached session.
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      await resolveAdmin(data.user ?? null);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      await resolveAdmin(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    setIsAdmin(false);
  }, [supabase]);

  return { user, isAdmin, loading, unconfigured, signOut };
}
