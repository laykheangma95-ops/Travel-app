'use client';

import { Check, ShoppingCart } from 'lucide-react';
import type { Destination, EsimPlan } from '@/types';
import { useCart } from '@/hooks/useCart';
import { cn, formatUsd } from '@/lib/utils';
import { useState } from 'react';

interface PlanCardProps {
  plan: EsimPlan;
  destination: Destination;
  dark?: boolean;
}

export function PlanCard({ plan, destination, dark = false }: PlanCardProps) {
  const addItem = useCart((s) => s.addItem);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
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
        <p className={cn('text-sm', dark ? 'text-white/70' : 'text-ink-secondary')}>{plan.dataGbDaily}GB/day</p>
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
        onClick={handleAdd}
        className={cn(
          'mt-7 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold transition-all duration-200 ease-smooth active:scale-[0.98]',
          added
            ? 'bg-success text-white'
            : plan.popular
              ? 'liquid-glass-accent liquid-sheen text-primary-deep hover:brightness-110'
              : dark
                ? 'liquid-glass liquid-sheen text-white hover:brightness-110'
                : 'bg-secondary text-white hover:bg-secondary-high'
        )}
      >
        {added ? (
          <>
            <Check size={16} /> Added to Cart
          </>
        ) : (
          <>
            <ShoppingCart size={16} /> Add to Cart
          </>
        )}
      </button>
    </div>
  );
}
