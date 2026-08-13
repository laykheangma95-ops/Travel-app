'use client';

// ─────────────────────────────────────────────────────────────────────────────
// "How much data have I got left?" — answered on the order it belongs to.
//
// THREE THINGS THIS CARD REFUSES TO DO:
//
//   1. Show a number the supplier did not give us. GoHub returns zeros for
//      several healthy states; /api/esim/usage flags those as unavailable and
//      this card renders the plan facts and an explanation instead. A blank is
//      honest. A fake zero is a customer abroad believing their data is gone.
//   2. Present a lagging number as live. Carrier usage is reported on a delay,
//      so every reading carries "updated N minutes ago". Without that stamp the
//      first thing a customer concludes is that we are miscounting on purpose.
//   3. Poll. This fetches once and on demand. A background timer on a phone
//      that is already someone's only connection abroad is a battery and data
//      cost we would be imposing without asking.
//
// ADD MORE DATA: the button buys a second eSIM for the same destination rather
// than topping up the existing one. Top-up is a real GoHub capability but
// `planPolicy.topupAvailable` is `null` for every plan we sell — unconfirmed —
// and CLAUDE.md rule 8 forbids inventing supplier behaviour. Buying another
// eSIM works today with real inventory. When GoHub confirm top-up per SKU, this
// button gains a second path; until then it does the thing that definitely
// works. See the TODO below.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, RefreshCw, Signal } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface PlanFacts {
  country: string;
  planName: string;
  durationDays: number;
  dataGbDaily: number;
  fulfilledAt: string | null;
}

type UsageResponse =
  | {
      available: true;
      usedMb: number;
      remainingMb: number;
      grantedMb: number;
      activatedAt: string | null;
      expiresAt: string | null;
      status: string;
      fetchedAt: string;
      plan: PlanFacts;
    }
  | {
      available: false;
      reason: 'not_configured' | 'no_iccid' | 'not_activated' | 'supplier_silent' | 'supplier_error';
      plan?: PlanFacts;
    };

const MB_PER_GB = 1024;

/** Below this fraction remaining, the ring turns amber and we nudge a top-up. */
const LOW_THRESHOLD = 0.2;

const UNAVAILABLE_COPY: Record<
  Extract<UsageResponse, { available: false }>['reason'],
  string
> = {
  not_activated:
    'Usage will appear once you install the eSIM and it connects to a network abroad.',
  supplier_silent:
    'The network has not reported usage for this eSIM yet. Your phone’s Settings › Mobile Data screen has the live figure.',
  supplier_error:
    'We could not reach the network just now. Try again in a minute — your data is unaffected.',
  not_configured:
    'Live usage is not available for this order. Check Settings › Mobile Data on your phone for the current figure.',
  no_iccid: 'Your eSIM is still being prepared. Usage will appear here once it is issued.',
};

export function DataUsageCard({ orderNumber }: { orderNumber: string }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const res = await fetch(`/api/esim/usage?order=${encodeURIComponent(orderNumber)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const body = (await res.json().catch(() => null)) as UsageResponse | null;
        if (res.ok && body) setData(body);
        else setData({ available: false, reason: 'supplier_error' });
      } catch {
        setData({ available: false, reason: 'supplier_error' });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderNumber]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-card border border-line bg-surface-3 p-4 text-sm text-ink-muted">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        Checking your data…
      </div>
    );
  }

  if (!data) return null;

  const plan = data.plan;
  const slug = plan ? destinationSlug(plan.country) : null;
  const topUpHref = slug ? `/esim/${slug}` : '/esim';

  // ── The supplier could not answer ──
  if (!data.available) {
    return (
      <div className="mt-4 rounded-card border border-line bg-surface-3 p-4">
        <div className="flex items-start gap-2.5">
          <Signal size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Data remaining</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
              {UNAVAILABLE_COPY[data.reason]}
            </p>
            {plan && (
              <p className="mt-2 text-xs text-ink-muted">
                Your plan: {plan.dataGbDaily}GB/day for {plan.durationDays} days.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.reason === 'supplier_error' && (
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw
                size={14}
                className={cn(refreshing && 'animate-spin')}
                aria-hidden="true"
              />
              Try again
            </Button>
          )}
          {/* TODO(gohub): when GoHub confirm per-SKU top-up (planPolicy.topupAvailable),
              offer "Top up this eSIM" here as the primary path and keep buying a
              second eSIM as the fallback. Do not build it against a guessed
              endpoint — CLAUDE.md rule 8. */}
          <Button variant="outline" size="sm" href={topUpHref}>
            <Plus size={14} aria-hidden="true" />
            Add more data
          </Button>
        </div>
      </div>
    );
  }

  // ── We have real numbers ──
  const { usedMb, remainingMb, grantedMb } = data;
  const fraction = grantedMb > 0 ? Math.max(0, Math.min(1, remainingMb / grantedMb)) : 0;
  const low = fraction <= LOW_THRESHOLD;
  const daysLeft = daysUntil(data.expiresAt);

  return (
    <div
      className={cn(
        'mt-4 rounded-card border p-4',
        low ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface-3'
      )}
    >
      <div className="flex items-center gap-4">
        <UsageRing fraction={fraction} low={low} />

        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-ink">
            {formatData(remainingMb)} left
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">
            of {formatData(grantedMb)} · {formatData(usedMb)} used
          </p>
          {daysLeft !== null && (
            <p className="mt-1 text-xs text-ink-secondary">
              {daysLeft > 0
                ? `Expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
                : 'Expired'}
            </p>
          )}
          {/* Never omit this. See the header note. */}
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
            Updated {relativeTime(data.fetchedAt)}
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-secondary underline underline-offset-2 transition-colors hover:text-secondary-high disabled:opacity-50"
              aria-label="Refresh data usage"
            >
              <RefreshCw
                size={11}
                className={cn(refreshing && 'animate-spin')}
                aria-hidden="true"
              />
              refresh
            </button>
          </p>
        </div>
      </div>

      {low && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-btn bg-amber-100 p-2.5 text-xs leading-relaxed text-amber-900"
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          You are running low. Add data now so you are not cut off mid-trip — a new eSIM
          installs in under a minute and works alongside this one.
        </p>
      )}

      <Button
        variant={low ? 'primary' : 'outline'}
        size="sm"
        href={topUpHref}
        className="mt-3 w-full"
      >
        <Plus size={14} aria-hidden="true" />
        Add more data
      </Button>
    </div>
  );
}

// ── The ring ─────────────────────────────────────────────────────────────────

function UsageRing({ fraction, low }: { fraction: number; low: boolean }) {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`${Math.round(fraction * 100)}% of your data remaining`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-line"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        className={cn(
          'transition-[stroke-dashoffset] duration-700 ease-smooth',
          low ? 'stroke-amber-500' : 'stroke-secondary'
        )}
      />
    </svg>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** MB below a gigabyte, GB above. "0.4GB left" reads worse than "410MB left". */
function formatData(mb: number): string {
  if (mb < MB_PER_GB) return `${Math.round(mb)}MB`;
  return `${Math.round((mb / MB_PER_GB) * 10) / 10}GB`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.ceil((then - Date.now()) / 86_400_000));
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'just now';
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Order rows store the country's display name; the store routes by slug. */
function destinationSlug(countryName: string): string | null {
  const match = destinations.find(
    (d) => d.name.toLowerCase() === countryName.trim().toLowerCase()
  );
  return match?.slug ?? null;
}
