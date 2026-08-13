'use client';

// ─────────────────────────────────────────────────────────────────────────────
// What the finder hands back: one confident recommendation, two alternatives,
// and a door to the full catalogue.
//
// The hero card shows the fit explicitly — "covers your 8 days with ~2GB spare"
// — because the number alone invites a second guess. The alternatives are
// deliberately labelled by *reason* ("cheaper, less spare" / "more data, less
// to think about") rather than by tier name: nobody arrives knowing what
// "Standard" means, and the whole point of the finder is that they should not
// have to learn.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Check, ShoppingCart } from 'lucide-react';
import type { Destination } from '@/types';
import type { AlternativeReason, PlanMatch, Recommendation } from '@/lib/esim/recommend';
import { useCart } from '@/hooks/useCart';
import { cn, formatUsd } from '@/lib/utils';

interface Props {
  recommendation: Recommendation;
  destination: Destination;
  days: number;
  lang: 'en' | 'km';
}

export function PlanResult({ recommendation, destination, days, lang }: Props) {
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);

  const { best, lighter, safer, shortfall } = recommendation;

  function lineFor(match: PlanMatch) {
    return {
      planId: match.plan.id,
      countrySlug: destination.slug,
      countryName: destination.name,
      flag: destination.flag,
      planName: match.plan.name,
      durationDays: match.plan.durationDays,
      dataType: match.plan.dataType,
      dataGbDaily: match.plan.dataGbDaily,
      dataGbTotal: match.plan.dataGbTotal,
      priceUsd: match.plan.priceUsd,
      quantity: 1,
    };
  }

  function buy(match: PlanMatch) {
    addItem(lineFor(match));
    router.push('/esim/checkout');
  }

  if (!best) {
    return (
      <div className="ml-10 rounded-card border border-white/10 bg-white/5 p-5 text-sm text-white/70">
        {lang === 'km'
          ? 'សូមអភ័យទោស យើងមិនទាន់មានគម្រោងសម្រាប់ដំណើរនេះទេ។'
          : 'We do not have a plan for this trip length yet.'}
        <Link
          href="/esim"
          className="mt-3 block font-semibold text-gold-light underline underline-offset-4"
        >
          {lang === 'km' ? 'មើលគម្រោងទាំងអស់' : 'Browse all plans'} →
        </Link>
      </div>
    );
  }

  const spareGb = Math.round((best.effectiveGb - recommendation.estimate.targetGb) * 10) / 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="ml-10 space-y-3"
    >
      {shortfall && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-card border border-amber-400/30 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-100"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {lang === 'km'
            ? 'គម្រោងនេះតូចជាងការប៉ាន់ស្មានរបស់អ្នក។ អ្នកអាចទិញបន្ថែមនៅពេលក្រោយ។'
            : 'This is smaller than our estimate for your trip. You can buy more data later if you run low — nothing is wasted.'}
        </p>
      )}

      {/* ── The recommendation ── */}
      <div className="relative overflow-hidden rounded-card border border-gold-light/40 bg-gradient-to-br from-gold-light/12 to-white/5 p-5 backdrop-blur-md">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-light/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gold-light">
          <Check size={11} strokeWidth={3} aria-hidden="true" />
          {lang === 'km' ? 'សម្រាប់អ្នក' : 'Best for you'}
        </span>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold text-white">
              {destination.flag}{' '}
              {Math.round(best.effectiveGb * 10) / 10}GB · {best.plan.durationDays}{' '}
              {lang === 'km' ? 'ថ្ងៃ' : 'days'}
            </h3>
            <p className="mt-1 text-xs text-white/60">
              {best.plan.dataType === 'daily'
                ? lang === 'km'
                  ? `${best.plan.dataGbDaily}GB រៀងរាល់ថ្ងៃ · កំណត់ឡើងវិញពាក់កណ្ដាលអធ្រាត្រ`
                  : `${best.plan.dataGbDaily}GB every day, resets at midnight`
                : lang === 'km'
                  ? `${best.plan.dataGbTotal}GB សម្រាប់ដំណើរទាំងមូល`
                  : `${best.plan.dataGbTotal}GB for the whole trip`}
              {' · '}
              {best.plan.speed}
            </p>
          </div>
          <p className="shrink-0 font-display text-2xl font-bold text-gold-light">
            {formatUsd(best.plan.priceUsd)}
          </p>
        </div>

        {!shortfall && spareGb > 0 && (
          <p className="mt-3 rounded-btn bg-white/5 px-3 py-2 text-xs text-white/70">
            {lang === 'km'
              ? `គ្របដណ្ដប់ ${days} ថ្ងៃរបស់អ្នក ដោយនៅសល់ប្រហែល ${spareGb}GB។`
              : `Covers your ${days} days with about ${spareGb}GB spare.`}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => buy(best)}
            className="liquid-glass-accent liquid-press flex flex-1 items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold text-primary-deep transition-all hover:brightness-110"
          >
            {lang === 'km' ? 'ទិញឥឡូវនេះ' : 'Buy now'}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => addItem(lineFor(best))}
            aria-label={lang === 'km' ? 'បន្ថែមទៅកន្ត្រក' : 'Add to cart'}
            className="liquid-glass liquid-press grid h-11 w-11 place-items-center rounded-btn text-white transition-all hover:brightness-110"
          >
            <ShoppingCart size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Alternatives ── */}
      {(lighter || safer) && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {lighter && (
            <AlternativeCard match={lighter} onBuy={() => buy(lighter)} lang={lang} />
          )}
          {safer && <AlternativeCard match={safer} onBuy={() => buy(safer)} lang={lang} />}
        </div>
      )}

      <Link
        href={`/esim/${destination.slug}`}
        className="block rounded-card border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium text-white/70 transition-all hover:border-gold-light/40 hover:text-white"
      >
        {lang === 'km'
          ? `មើលគម្រោងទាំងអស់សម្រាប់ ${destination.nameKm}`
          : `See all ${destination.name} plans`}{' '}
        →
      </Link>
    </motion.div>
  );
}

/**
 * The label names the real difference against the recommended plan — the engine
 * works out which one applies. A slot that always said "more data" would sit
 * above a plan offering the same data for longer on most destinations, because
 * GoHub's range per country is thin.
 */
const REASON_COPY: Record<AlternativeReason, { en: string; km: string }> = {
  cheaper: { en: 'Cheaper, tighter on data', km: 'ថោកជាង ទិន្នន័យតិចជាង' },
  more_per_day: { en: 'More data each day', km: 'ទិន្នន័យច្រើនជាងរៀងរាល់ថ្ងៃ' },
  more_total: { en: 'More data overall', km: 'ទិន្នន័យសរុបច្រើនជាង' },
  longer_validity: { en: 'Same data, more days', km: 'ទិន្នន័យដូចគ្នា ថ្ងៃច្រើនជាង' },
};

function AlternativeCard({
  match,
  onBuy,
  lang,
}: {
  match: PlanMatch;
  onBuy: () => void;
  lang: 'en' | 'km';
}) {
  const reason = match.reason ? REASON_COPY[match.reason] : null;

  return (
    <button
      type="button"
      onClick={onBuy}
      className={cn(
        'liquid-press rounded-card border border-white/10 bg-white/5 p-4 text-left transition-all duration-200 ease-smooth',
        'hover:border-gold-light/40 hover:bg-white/10'
      )}
    >
      {reason && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {reason[lang]}
        </p>
      )}
      <p className="mt-1.5 font-display text-base font-bold text-white">
        {Math.round(match.effectiveGb * 10) / 10}GB · {match.plan.durationDays}{' '}
        {lang === 'km' ? 'ថ្ងៃ' : 'days'}
      </p>
      <p className="mt-1 text-sm font-semibold text-gold-light">
        {formatUsd(match.plan.priceUsd)}
      </p>
    </button>
  );
}
