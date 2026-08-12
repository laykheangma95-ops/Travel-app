'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crown,
  Eye,
  FileSpreadsheet,
  Headphones,
  Package,
  QrCode,
  ShieldCheck,
} from 'lucide-react';

/**
 * The owner's landing strip on /admin.
 *
 * WHY IT LOOKS DIFFERENT FROM THE REST OF THE PANEL:
 *   The admin panel is a light utility surface on purpose — dense figures and
 *   long tables read better on white (see .claude/skills/ui-ux §1). This strip
 *   is the exception: it is not dense data, it is the first thing the owner
 *   sees, and Temple Night navy makes "this is your room" legible in the first
 *   half second without a word of copy. It also keeps the brand present in a
 *   screen that would otherwise read as generic SaaS.
 *
 *   Gold is the scarce accent, and the header badge already spends one. So this
 *   panel uses exactly one more — the eyebrow — and nothing else. No second
 *   accent CTA competes with it.
 *
 * WHY THE NUMBERS ARE PASSED IN RATHER THAN FETCHED:
 *   The dashboard already loads them from /api/admin/orders. Fetching again
 *   would double the request on every visit and could show two different
 *   answers on one screen while the second call was in flight.
 */

interface OwnerBriefingProps {
  /** Paid, but the customer has no eSIM yet. The only genuinely urgent number. */
  awaitingFulfilment: number;
  /** Started checkout, never paid. Worth watching, not worth waking up for. */
  pendingPayment: number;
  /** True while the figures are still loading — shown as em dashes, never zeros. */
  loading: boolean;
}

/**
 * Fast paths for the jobs done most often. Ordered by how often they are
 * actually needed on a normal day, not by how important they sound: a customer
 * on the phone beats a report every time.
 */
const QUICK_ACTIONS = [
  { label: 'Find a customer', href: '/admin/support', icon: Headphones },
  { label: 'All orders', href: '/admin/orders', icon: Package },
  { label: 'Issue an eSIM', href: '/admin/generate-esim', icon: QrCode },
  { label: 'Sales statement', href: '/admin/reports', icon: FileSpreadsheet },
  { label: 'Staff & roles', href: '/admin/staff', icon: ShieldCheck },
  // Staff are redirected from /dashboard into the panel (see middleware.ts).
  // This is the way back out — without it the owner cannot see the site the way
  // a traveller sees it, which is the one view they most need to sanity-check.
  { label: 'View as customer', href: '/dashboard?customer=1', icon: Eye },
];

export function OwnerBriefing({
  awaitingFulfilment,
  pendingPayment,
  loading,
}: OwnerBriefingProps) {
  const needsAttention = awaitingFulfilment > 0;

  return (
    <section
      aria-labelledby="owner-briefing-heading"
      className="overflow-hidden rounded-card bg-primary shadow-card"
    >
      <div className="px-6 py-7 sm:px-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
          <Crown size={13} aria-hidden="true" />
          Owner
        </p>

        <h2
          id="owner-briefing-heading"
          className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl"
        >
          {loading
            ? 'Checking the business…'
            : needsAttention
              ? 'Something needs you'
              : 'Everything is running'}
        </h2>

        {/* One sentence, in plain language, that says what to do next. A number
            without an instruction makes the reader do the interpreting. */}
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
          {loading ? (
            'Loading today’s position.'
          ) : needsAttention ? (
            <>
              <strong className="font-semibold text-white">
                {awaitingFulfilment} {awaitingFulfilment === 1 ? 'customer has' : 'customers have'}{' '}
                paid
              </strong>{' '}
              and {awaitingFulfilment === 1 ? 'is' : 'are'} still waiting for their eSIM. That is the
              one thing on this screen worth doing first.
            </>
          ) : (
            'No paid order is waiting for delivery. Anything else here can wait until you have time.'
          )}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <StatusPill
            tone={needsAttention ? 'urgent' : 'calm'}
            icon={needsAttention ? AlertTriangle : CheckCircle2}
            label="Awaiting fulfilment"
            value={loading ? '—' : String(awaitingFulfilment)}
          />
          <StatusPill
            tone="calm"
            icon={Package}
            label="Unpaid checkouts"
            value={loading ? '—' : String(pendingPayment)}
          />
        </div>

        {needsAttention && !loading && (
          <Link
            href="/admin/orders?status=paid"
            className="mt-6 inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn bg-accent px-5 text-sm font-semibold text-primary-deep transition-colors duration-200 hover:bg-gold-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
          >
            Deliver these orders
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </div>

      <nav
        aria-label="Owner quick actions"
        className="border-t border-white/10 bg-primary-deep px-6 py-4 sm:px-8"
      >
        <ul className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/80 transition-colors duration-200 hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
              >
                <action.icon size={15} aria-hidden="true" />
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

function StatusPill({
  tone,
  icon: Icon,
  label,
  value,
}: {
  tone: 'urgent' | 'calm';
  icon: typeof AlertTriangle;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-btn border border-white/10 bg-white/5 px-4 py-3">
      <Icon
        size={17}
        className={tone === 'urgent' ? 'text-warning' : 'text-white/50'}
        aria-hidden="true"
      />
      <div>
        <p className="font-display text-lg font-bold leading-none text-white">{value}</p>
        <p className="mt-1 text-xs text-white/60">{label}</p>
      </div>
    </div>
  );
}
