import { Check, Globe2, Info, Minus, Signal, Smartphone, Timer } from 'lucide-react';
import type { EsimPlan } from '@/types';
import { destinationNetworks } from '@/data/gohubNetworks';
import { activationDeadline, policyFor } from '@/data/planPolicy';
import { describeAllowance } from '@/data/esimPlans';

interface PlanSpecsProps {
  countrySlug: string;
  countryName: string;
  plans: EsimPlan[];
}

interface SpecRow {
  label: string;
  value: string;
  /** Rendered under the value in smaller muted type. */
  note?: string;
}

/**
 * The spec sheet a customer reads before paying.
 *
 * WHY IT EXISTS:
 *   Every question answered here is one the customer would otherwise have to
 *   guess at — whose network is this, will my hotspot work, do I need my
 *   passport, how long is the QR good for. An unanswered question at the
 *   payment step is an abandoned cart.
 *
 * THE RULE:
 *   Only facts we can source. Network, speed, coverage and voice come from
 *   GoHub's price list; the allowance and duration come from the plan itself.
 *   Anything GoHub have not told us — hotspot, KYC, top-up, activation window —
 *   is simply absent, never guessed. See data/planPolicy.ts for why.
 */
export function PlanSpecs({ countrySlug, countryName, plans }: PlanSpecsProps) {
  if (plans.length === 0) return null;

  const network = destinationNetworks[countrySlug];
  const policy = policyFor(countrySlug);
  const [reference] = plans;

  const carriers = network
    ? network.coverage.length > 0
      ? network.coverage.flatMap((c) => c.carriers)
      : network.carriers
    : [];

  const rows: SpecRow[] = [];

  rows.push({
    label: 'eSIM type',
    value: reference!.callSms ? 'Data, calls and SMS' : 'Data only',
  });

  rows.push({ label: 'Call + SMS', value: reference!.callSms ? 'Yes' : 'No' });

  if (network) {
    rows.push({
      label: 'Speed',
      value: reference!.speed,
      note:
        reference!.dataType === 'daily'
          ? 'Once the day’s allowance is used, speed is reduced until it resets.'
          : 'Once the allowance is used, data stops until you buy again.',
    });
  }

  if (carriers.length > 0) {
    rows.push({
      label: 'Network provider',
      value: [...new Set(carriers)].join(', '),
      note: `In ${countryName} you connect to a local carrier — not roaming.`,
    });
  }

  rows.push({
    label: 'Data',
    value: plans.map((plan) => `${describeAllowance(plan)} · ${plan.durationDays} days`).join('  |  '),
  });

  if (reference!.dataType === 'daily') {
    rows.push({
      label: 'Daily reset',
      value: 'Every 24 hours',
      note: 'A slow day does not use up the rest of your trip.',
    });
  }

  // Only rendered once GoHub have confirmed them — see data/planPolicy.ts.
  if (policy.hotspot !== null) {
    rows.push({ label: 'Hotspot', value: policy.hotspot ? 'Yes' : 'No' });
  }
  if (policy.kycRequired !== null) {
    rows.push({
      label: 'KYC required',
      value: policy.kycRequired ? 'Yes — passport registration' : 'No',
      note: policy.kycRequired && policy.kycUrl ? `Register at ${policy.kycUrl}` : undefined,
    });
  }
  if (policy.topupAvailable !== null) {
    rows.push({ label: 'Top-up', value: policy.topupAvailable ? 'Yes' : 'No' });
  }
  if (policy.specialActivation) {
    rows.push({ label: 'Activation step', value: policy.specialActivation });
  }
  if (policy.unsupportedApps) {
    rows.push({ label: 'Restrictions', value: policy.unsupportedApps });
  }

  const deadline = activationDeadline(policy);

  return (
    <section aria-labelledby="plan-specs-heading" className="mt-14">
      <p className="font-display text-xs font-bold uppercase tracking-widest text-gold-light">
        Before you buy
      </p>
      <h2
        id="plan-specs-heading"
        className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl"
      >
        What you get, in full
      </h2>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <dl className="night-card space-y-4 p-6 lg:col-span-2">
          {rows.map((row) => (
            <div key={row.label} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
              <dt className="text-sm font-semibold text-white">{row.label}</dt>
              <dd className="mt-1 text-sm text-white/75">{row.value}</dd>
              {row.note && <p className="mt-1 text-xs text-white/50">{row.note}</p>}
            </div>
          ))}
        </dl>

        <div className="space-y-4">
          {network && network.coverage.length > 0 && (
            <div className="night-card p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Globe2 size={16} aria-hidden="true" className="text-gold-light" />
                Works in {network.coverage.length}{' '}
                {network.coverage.length === 1 ? 'country' : 'countries'}
              </p>
              <ul className="mt-3 space-y-1.5">
                {network.coverage.map((entry) => (
                  <li key={entry.country} className="text-xs text-white/70">
                    <span className="text-white/90">{entry.country}</span>
                    <span className="text-white/45"> — {entry.carriers.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deadline && (
            <div className="night-card p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Timer size={16} aria-hidden="true" className="text-gold-light" />
                Activate within {policy.activationWindowDays} days
              </p>
              <p className="mt-2 text-xs text-white/60">
                Buy today and the QR stays valid until{' '}
                <span className="font-mono text-white/85">
                  {deadline.toLocaleDateString('en-GB')}
                </span>
                . Your plan only starts counting when you connect abroad.
              </p>
            </div>
          )}

          <div className="night-card p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Smartphone size={16} aria-hidden="true" className="text-gold-light" />
              Keep your Cambodian number
            </p>
            <p className="mt-2 text-xs text-white/60">
              The eSIM sits alongside your normal SIM. Calls and SMS on your Khmer number keep
              working — you choose which line uses data.
            </p>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs text-white/45">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          Network and coverage details come directly from our supplier’s current price list. If
          anything here turns out to be wrong for your trip, that is on us — see the replacement
          promise below.
        </p>
      )}
    </section>
  );
}

/** Small inline marker used by the tier cards. Exported for reuse. */
export function SpecTick({ on }: { on: boolean }) {
  return on ? (
    <Check size={14} aria-hidden="true" className="text-success" />
  ) : (
    <Minus size={14} aria-hidden="true" className="text-white/40" />
  );
}

export { Signal };
