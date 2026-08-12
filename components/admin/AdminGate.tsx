'use client';

import { Lock, Loader2, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSession } from '@/hooks/useSession';
import { Button } from '@/components/ui/Button';

/**
 * Presentation-only gate for the admin panel.
 *
 * It renders a friendly message instead of a broken page — it does NOT protect
 * anything. Access is enforced in two places a browser cannot reach:
 *   • middleware.ts, which 404s /admin before any HTML is sent
 *   • requireAdmin() inside every /api/admin/* route
 *
 * The previous version stored `domner-admin=1` in sessionStorage and trusted it
 * on reload, so one line in devtools opened the whole panel.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, unconfigured, blockedReason, checkFailed } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <Loader2 size={22} className="animate-spin text-ink-muted" aria-label="Checking access" />
      </div>
    );
  }

  // No Supabase project configured — development only. The API routes still
  // refuse every write, so this shows the panel shell with no live data.
  if (unconfigured) {
    return (
      <>
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 p-4"
        >
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm text-amber-900">
            <strong>Development mode.</strong> Supabase is not configured, so no live orders can be
            loaded and no admin action will be saved.
          </p>
        </div>
        {children}
      </>
    );
  }

  if (!user) {
    return (
      <GateMessage
        title="Sign in required"
        body="The Domner control panel is only available to signed-in staff accounts."
        href="/sign-in?returnTo=/admin"
        cta="Sign in"
      />
    );
  }

  // Signed in as staff, but currently held back. Saying which is the difference
  // between someone enrolling a second factor in two minutes and someone
  // messaging the founder on a Sunday.
  if (blockedReason === 'mfa_required') {
    return (
      <GateMessage
        title="Two-factor required"
        body="Staff accounts must have a second factor enrolled. Add one in your account settings, then sign in again."
        href="/settings"
        cta="Account settings"
      />
    );
  }

  if (blockedReason === 'deactivated') {
    return (
      <GateMessage
        title="Account deactivated"
        body="This staff account is no longer active. Ask an administrator to restore it."
        href="/dashboard"
        cta="Back to dashboard"
      />
    );
  }

  // The check itself did not complete, so we do not know what they hold. Saying
  // "you have no staff role" here is a lie that sends an admin off to ask
  // someone for access they already have — which is exactly what a throttled
  // /api/admin/session used to do to the owner.
  if (checkFailed) {
    return (
      <GateMessage
        title="Could not verify access"
        body="We could not confirm your permissions just now — that is usually a temporary network problem or too many requests in a short time. Wait a moment and reload; your access has not changed."
        href="/admin"
        cta="Try again"
      />
    );
  }

  if (!isAdmin) {
    return (
      <GateMessage
        title="No staff access"
        body={`${user.email ?? 'This account'} has no staff role. Ask an administrator to add you and choose the access you need.`}
        href="/dashboard"
        cta="Back to dashboard"
      />
    );
  }

  return <>{children}</>;
}

function GateMessage({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-3">
        <Lock size={24} className="text-ink-secondary" aria-hidden="true" />
      </span>
      <h1 className="mt-5 font-display text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-secondary">{body}</p>
      <Button href={href} variant="secondary" className="mt-6">
        {cta}
      </Button>
    </div>
  );
}
