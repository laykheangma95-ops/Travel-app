'use client';

// Chapter 6 — one card, not a comparison table.
//
// The argument this card has to win is that it is *advice*, not a sale. So the
// reasoning is not hidden behind a tooltip: the per-line estimate is the body of
// the card, every line names its own daily rate, and you can switch a line off
// ("I don't use TikTok") and watch the recommendation change underneath you.
//
// Adjusting is secondary — the plan is already chosen and one tap buys it — but
// it has to be visible, because a recommendation you cannot interrogate is just
// a price tag with a friendly label on it.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ShoppingBag } from 'lucide-react';
import { getPlansForCountry } from '@/data/esimPlans';
import { getDestination } from '@/data/destinations';
import { useCart } from '@/hooks/useCart';
import { useBi, useLang } from '@/lib/i18n';
import { USAGE_LINES, DEFAULT_LINE_IDS, estimateUsage } from '@/content/usage-model';
import type { DestinationGuide } from '@/content/schema';

export function Recommendation({ guide }: { guide: DestinationGuide }) {
  const { t } = useLang();
  const bi = useBi();
  const addItem = useCart((s) => s.addItem);
  const [days, setDays] = useState(8);
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_LINE_IDS);
  const [added, setAdded] = useState(false);

  const destination = getDestination(guide.esimCountrySlug);
  const plans = useMemo(() => getPlansForCountry(guide.esimCountrySlug), [guide.esimCountrySlug]);
  const estimate = useMemo(() => estimateUsage(days, enabled), [days, enabled]);

  // Pick the cheapest plan whose allowance covers the estimate and whose
  // validity covers the trip. If nothing covers it, recommend the largest we
  // have rather than pretending a smaller one is enough.
  const plan = useMemo(() => {
    if (!plans.length) return null;
    const sized = plans
      .map((p) => ({ p, totalGb: p.dataGbDaily * p.durationDays }))
      .sort((a, b) => a.p.priceUsd - b.p.priceUsd);
    return (
      sized.find((s) => s.totalGb >= estimate.withHeadroomGb && s.p.durationDays >= days)?.p ??
      sized[sized.length - 1].p
    );
  }, [plans, estimate.withHeadroomGb, days]);

  if (!plan || !destination) return null;

  const planTotalGb = plan.dataGbDaily * plan.durationDays;
  const covers = planTotalGb >= estimate.withHeadroomGb && plan.durationDays >= days;
  const maxLine = Math.max(...estimate.lines.map((l) => l.gb), 0.1);

  const toggle = (id: string) =>
    setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const buy = () => {
    addItem({
      planId: plan.id,
      countrySlug: destination.slug,
      countryName: destination.name,
      flag: destination.flag,
      planName: plan.name,
      durationDays: plan.durationDays,
      dataGbDaily: plan.dataGbDaily,
      priceUsd: plan.priceUsd,
      quantity: 1,
    });
    setAdded(true);
  };

  return (
    <div className="v3-rec">
      <p className="v3-rec-kicker">{t('v3.rec.title')}</p>

      <div className="v3-rec-head">
        <div>
          <p className="v3-rec-headline">
            {plan.durationDays} {t('v3.rec.days')} · {planTotalGb} GB
          </p>
          <p className="v3-rec-sub">
            {bi({
              en: 'Enough for maps, video, photos and translation.',
              km: 'គ្រប់គ្រាន់សម្រាប់ផែនទី វីដេអូ រូបថត និងការបកប្រែ។',
            })}
          </p>
        </div>
        <p className="v3-rec-price">${plan.priceUsd.toFixed(2)}</p>
      </div>

      <div className="v3-rec-reasoning">
        <p className="v3-rec-reasoning-title">
          {t('v3.rec.typical')} {days} {t('v3.rec.days')}
        </p>

        <ul className="v3-rec-lines">
          {USAGE_LINES.map((line) => {
            const on = enabled.includes(line.id);
            const gb = estimate.lines.find((l) => l.id === line.id)?.gb ?? 0;
            return (
              <li key={line.id}>
                <button
                  type="button"
                  className={`v3-rec-line ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(line.id)}
                >
                  <span className="v3-rec-line-label">{bi(line.label)}</span>
                  <span className="v3-rec-line-bar" aria-hidden="true">
                    <span style={{ width: `${on ? Math.max(4, (gb / maxLine) * 100) : 0}%` }} />
                  </span>
                  <span className="v3-rec-line-gb">{on ? `${gb} GB` : '—'}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="v3-rec-total">
          <span>{t('v3.rec.total')}</span>
          <span className="v3-rec-total-gb">{estimate.withHeadroomGb} GB</span>
        </div>
        <p className="v3-rec-disclaimer">{t('v3.rec.disclaimer')}</p>
      </div>

      {!covers && (
        <p className="v3-rec-warning">
          {bi({
            en: 'This is the largest plan we carry for this destination, and it is below your estimate. Support can top you up mid-trip.',
            km: 'នេះជាគម្រោងធំបំផុតដែលយើងមានសម្រាប់គោលដៅនេះ ហើយវាតិចជាងការប៉ាន់ស្មានរបស់អ្នក។ ក្រុមជំនួយអាចបញ្ចូលបន្ថែមកំឡុងដំណើរ។',
          })}
        </p>
      )}

      <div className="v3-rec-actions">
        {added ? (
          <Link href="/cart" className="v3-btn v3-btn-primary">
            <Check size={17} aria-hidden="true" /> {t('v3.rec.added')}
          </Link>
        ) : (
          <button type="button" className="v3-btn v3-btn-primary" onClick={buy}>
            <ShoppingBag size={17} aria-hidden="true" /> {t('v3.rec.buy')}
          </button>
        )}

        <div className="v3-rec-days">
          <span id="v3-days-label">{t('v3.rec.tripLength')}</span>
          <div className="v3-rec-stepper">
            <button
              type="button"
              onClick={() => setDays((d) => Math.max(1, d - 1))}
              aria-label={bi({ en: 'One day fewer', km: 'តិចមួយថ្ងៃ' })}
            >
              −
            </button>
            <output aria-live="polite" aria-labelledby="v3-days-label">
              {days} {t('v3.rec.days')}
            </output>
            <button
              type="button"
              onClick={() => setDays((d) => Math.min(30, d + 1))}
              aria-label={bi({ en: 'One day more', km: 'បន្ថែមមួយថ្ងៃ' })}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <Link href={`/esim/${destination.slug}`} className="v3-rec-all">
        {bi({ en: 'See every plan for this destination', km: 'មើលគម្រោងទាំងអស់សម្រាប់គោលដៅនេះ' })}
      </Link>
    </div>
  );
}
