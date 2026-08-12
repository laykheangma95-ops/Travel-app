'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export interface SessionState {
  user: User | null;
  /** Server-verified. Never derived from the email in the browser. */
  isAdmin: boolean;
  /** Server-verified staff role, or null when the caller holds no authority. */
  role: string | null;
  /** Capabilities the caller holds. Drives which nav tabs and buttons render. */
  permissions: string[];
  /** Set when signed in as staff but currently held back — 'deactivated' | 'mfa_required'. */
  blockedReason: string | null;
  /** True when access came from ADMIN_EMAIL rather than a staff_users row. */
  viaBootstrap: boolean;
  /**
   * True when the authority check could not be completed — throttled, offline,
   * or the endpoint errored. Distinct from "you hold nothing", which is a
   * definitive answer. Both leave the panel closed; only this one is worth
   * retrying, and telling them apart is the difference between "wait a moment"
   * and "ask an administrator for access you already have".
   */
  checkFailed: boolean;
  loading: boolean;
  /** True when Supabase is not configured — development / demo mode. */
  unconfigured: boolean;
  can: (permission: string) => boolean;
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
interface Authority {
  admin: boolean;
  role: string | null;
  permissions: string[];
  blockedReason: string | null;
  viaBootstrap: boolean;
}

const NO_AUTHORITY: Authority = {
  admin: false,
  role: null,
  permissions: [],
  blockedReason: null,
  viaBootstrap: false,
};

export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [authority, setAuthority] = useState<Authority>(NO_AUTHORITY);
  const [checkFailed, setCheckFailed] = useState(false);
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
        if (active) {
          setAuthority(NO_AUTHORITY);
          setCheckFailed(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/admin/session', { credentials: 'include' });
        const data = (await res.json()) as Partial<Authority>;
        if (!active) return;
        // Still fail closed — the panel stays shut either way. What changes is
        // that we remember WHY, so the UI does not accuse someone of lacking a
        // role when we simply never got an answer.
        setAuthority(
          res.ok
            ? {
                admin: data.admin === true,
                role: data.role ?? null,
                permissions: data.permissions ?? [],
                blockedReason: data.blockedReason ?? null,
                viaBootstrap: data.viaBootstrap === true,
              }
            : NO_AUTHORITY
        );
        setCheckFailed(!res.ok);
      } catch {
        // Fail closed: a failed check must never paint the panel.
        if (active) {
          setAuthority(NO_AUTHORITY);
          setCheckFailed(true);
        }
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
    setAuthority(NO_AUTHORITY);
    setCheckFailed(false);
  }, [supabase]);

  const can = useCallback(
    (permission: string) => authority.permissions.includes(permission),
    [authority.permissions]
  );

  return {
    user,
    isAdmin: authority.admin,
    role: authority.role,
    permissions: authority.permissions,
    blockedReason: authority.blockedReason,
    viaBootstrap: authority.viaBootstrap,
    checkFailed,
    loading,
    unconfigured,
    can,
    signOut,
  };
}
