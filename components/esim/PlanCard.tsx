'use client';

import { ArrowRight, Check, ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Destination, EsimPlan } from '@/types';
import { useCart } from '@/hooks/useCart';
import { describeAllowance } from '@/data/esimPlans';
import { cn, formatUsd } from '@/lib/utils';
import { useState } from 'react';
import { useLang } from '@/lib/i18n';

interface PlanCardProps {
  plan: EsimPlan;
  destination: Destination;
  dark?: boolean;
}

export function PlanCard({ plan, destination, dark = false }: PlanCardProps) {
  const { t } = useLang();
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);
  const [added, setAdded] = useState(false);

  const line = () => ({
    planId: plan.id,
    countrySlug: destination.slug,
    countryName: destination.name,
    flag: destination.flag,
    planName: plan.name,
    durationDays: plan.durationDays,
    dataType: plan.dataType,
    dataGbDaily: plan.dataGbDaily,
    dataGbTotal: plan.dataGbTotal,
    priceUsd: plan.priceUsd,
    quantity: 1,
  });

  // The card's main action now finishes the choice instead of parking it.
  //
  // WHY: picking a plan used to drop it in the cart and leave you exactly where
  // you were, on a page full of plans, with a small "Added to Cart" flash as
  // the only sign anything happened. Choosing is the decision — the customer
  // has said yes to this plan at this price. Making them then find the cart
  // icon and press checkout is two steps of nothing, and the common reading of
  // a page that does not move is that the button did not work.
  //
  // Almost everyone buys one eSIM for one trip, so "Buy now" is the primary
  // path. "Add to cart" stays as the secondary action for the traveller doing
  // two countries in one trip — that case is real, it is just not the default.
  const handleBuyNow = () => {
    addItem(line());
    router.push('/esim/checkout');
  };

  const handleAdd = () => {
    addItem(line());
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <div
      className={cn(
        'relative flex flex-col p-8 transition-all duration-300 ease-smooth',
        dark
          ? cn('night-card', plan.popular && 'lg:scale-[1.04] lg:hover:scale-[1.05]')
          : cn(
              'rounded-card border bg-white shadow-card hover:-translate-y-1 hover:shadow-card-hover',
              plan.popular ? 'border-2 border-accent lg:scale-[1.04] lg:hover:scale-[1.05]' : 'border-line/60'
            ),
        dark && plan.popular && 'ring-1 ring-gold-light/50'
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full liquid-glass-accent px-4 py-1 text-xs font-bold uppercase tracking-wide text-primary-deep shadow-md">
          ⭐ Most Popular
        </span>
      )}
      <h3 className={cn('font-display text-lg font-bold uppercase tracking-wide', dark ? 'text-gold-light' : 'text-ink-secondary')}>
        {plan.name}
      </h3>
      <p className={cn('mt-4 font-display text-4xl font-extrabold', dark ? 'text-white' : 'text-ink')}>{formatUsd(plan.priceUsd)}</p>
      <div className={cn('mt-5 space-y-1 border-b pb-5', dark ? 'border-white/10' : 'border-line')}>
        <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-ink')}>{plan.durationDays} days</p>
        <p className={cn('text-sm', dark ? 'text-white/70' : 'text-ink-secondary')}>{describeAllowance(plan)}</p>
        <p className={cn('font-mono text-xs', dark ? 'text-white/50' : 'text-ink-muted')}>{plan.network}</p>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className={cn('flex items-start gap-2 text-sm', dark ? 'text-white/70' : 'text-ink-secondary')}>
            <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleBuyNow}
        className={cn(
          'mt-7 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold transition-all duration-200 ease-smooth active:scale-[0.98]',
          plan.popular
            ? 'liquid-glass-accent liquid-sheen text-primary-deep hover:brightness-110'
            : dark
              ? 'liquid-glass liquid-sheen text-white hover:brightness-110'
              : 'bg-secondary text-white hover:bg-secondary-high'
        )}
      >
        {t('plan.buyNow')}
        <ArrowRight size={16} aria-hidden="true" />
      </button>

      {/* Quiet on purpose. It must be findable by the person buying two
          countries, and must not compete with the decision above it. */}
      <button
        type="button"
        onClick={handleAdd}
        className={cn(
          'mt-2.5 inline-flex min-h-[2.5rem] w-full items-center justify-center gap-2 rounded-btn px-5 py-2 text-sm font-medium transition-colors duration-200',
          added
            ? 'text-success'
            : dark
              ? 'text-white/70 hover:bg-white/10 hover:text-white'
              : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'
        )}
        // Says what happened without moving the page, for anyone using a screen
        // reader — the colour flash alone is invisible to them.
        aria-live="polite"
      >
        {added ? (
          <>
            <Check size={16} aria-hidden="true" /> {t('plan.added')}
          </>
        ) : (
          <>
            <ShoppingCart size={16} aria-hidden="true" /> {t('plan.addToCart')}
          </>
        )}
      </button>
    </div>
  );
}
