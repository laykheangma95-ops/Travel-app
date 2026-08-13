'use client';

import { Check, Globe2, Info, Minus, Signal, Smartphone, Timer } from 'lucide-react';
import type { EsimPlan } from '@/types';
import { destinationNetworks } from '@/data/gohubNetworks';
import { activationDeadline, policyFor } from '@/data/planPolicy';
import { useAllowanceLabel } from '@/data/esimPlans';
import { useLang } from '@/lib/i18n';

interface PlanSpecsProps {
  countrySlug: string;
  countryName: string;
  countryNameKm?: string;
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
export function PlanSpecs({ countrySlug, countryName, countryNameKm, plans }: PlanSpecsProps) {
  const { lang, t } = useLang();
  const allowanceLabel = useAllowanceLabel();
  const localCountry = lang === 'km' && countryNameKm ? countryNameKm : countryName;

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
    label: t('specs.type'),
    value: t(reference!.callSms ? 'specs.typeDataCalls' : 'specs.typeDataOnly'),
  });

  rows.push({
    label: t('specs.callSms'),
    value: t(reference!.callSms ? 'specs.yes' : 'specs.no'),
  });

  if (network) {
    rows.push({
      label: t('specs.speed'),
      value: reference!.speed,
      note: t(
        reference!.dataType === 'daily' ? 'specs.speedNoteDaily' : 'specs.speedNoteTotal'
      ),
    });
  }

  if (carriers.length > 0) {
    rows.push({
      label: t('specs.carrier'),
      value: [...new Set(carriers)].join(', '),
      note: t('specs.carrierNote', { country: localCountry }),
    });
  }

  rows.push({
    label: t('specs.data'),
    value: plans
      .map((plan) =>
        t('specs.dataEntry', { allowance: allowanceLabel(plan), days: plan.durationDays })
      )
      .join('  |  '),
  });

  if (reference!.dataType === 'daily') {
    rows.push({
      label: t('specs.reset'),
      value: t('specs.resetValue'),
      note: t('specs.resetNote'),
    });
  }

  // Only rendered once GoHub have confirmed them — see data/planPolicy.ts.
  if (policy.hotspot !== null) {
    rows.push({ label: t('specs.hotspot'), value: t(policy.hotspot ? 'specs.yes' : 'specs.no') });
  }
  if (policy.kycRequired !== null) {
    rows.push({
      label: t('specs.kyc'),
      value: t(policy.kycRequired ? 'specs.kycYes' : 'specs.no'),
      note:
        policy.kycRequired && policy.kycUrl
          ? t('specs.kycNote', { url: policy.kycUrl })
          : undefined,
    });
  }
  if (policy.topupAvailable !== null) {
    rows.push({
      label: t('specs.topup'),
      value: t(policy.topupAvailable ? 'specs.yes' : 'specs.no'),
    });
  }
  // These two are free-text supplier notes, so they stay as supplied.
  if (policy.specialActivation) {
    rows.push({ label: t('specs.activationStep'), value: policy.specialActivation });
  }
  if (policy.unsupportedApps) {
    rows.push({ label: t('specs.restrictions'), value: policy.unsupportedApps });
  }

  const deadline = activationDeadline(policy);

  return (
    <section aria-labelledby="plan-specs-heading" className="mt-14">
      <p className="font-display text-xs font-bold uppercase tracking-widest text-gold-light">
        {t('specs.eyebrow')}
      </p>
      <h2
        id="plan-specs-heading"
        className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl"
      >
        {t('specs.title')}
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
                {t(network.coverage.length === 1 ? 'specs.worksIn' : 'specs.worksInPlural', {
                  count: network.coverage.length,
                })}
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
                {t('specs.activateWithin', { days: policy.activationWindowDays ?? 0 })}
              </p>
              <p className="mt-2 text-xs text-white/60">
                {t('specs.activateNoteBefore')}{' '}
                <span className="font-mono text-white/85">
                  {deadline.toLocaleDateString('en-GB')}
                </span>
                {t('specs.activateNoteAfter')}
              </p>
            </div>
          )}

          <div className="night-card p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Smartphone size={16} aria-hidden="true" className="text-gold-light" />
              {t('specs.keepNumber')}
            </p>
            <p className="mt-2 text-xs text-white/60">{t('specs.keepNumberNote')}</p>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs text-white/45">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t('specs.source')}
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
