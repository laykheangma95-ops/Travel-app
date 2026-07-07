'use client';

import { Check, ShoppingCart } from 'lucide-react';
import type { Destination, EsimPlan } from '@/types';
import { useCart } from '@/hooks/useCart';
import { cn, formatUsd } from '@/lib/utils';
import { useState } from 'react';

interface PlanCardProps {
  plan: EsimPlan;
  destination: Destination;
}

export function PlanCard({ plan, destination }: PlanCardProps) {
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
        'relative flex flex-col rounded-card border bg-white p-8 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:shadow-card-hover',
        plan.popular ? 'border-2 border-accent lg:scale-[1.04] lg:hover:scale-[1.05]' : 'border-line/60'
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-md">
          ⭐ Most Popular
        </span>
      )}
      <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink-secondary">
        {plan.name}
      </h3>
      <p className="mt-4 font-display text-4xl font-extrabold text-ink">{formatUsd(plan.priceUsd)}</p>
      <div className="mt-5 space-y-1 border-b border-line pb-5">
        <p className="text-sm font-semibold text-ink">{plan.durationDays} days</p>
        <p className="text-sm text-ink-secondary">{plan.dataGbDaily}GB/day</p>
        <p className="font-mono text-xs text-ink-muted">{plan.network}</p>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-ink-secondary">
            <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleAdd}
        className={cn(
          'mt-7 inline-flex w-full items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold transition-all duration-200 ease-smooth active:scale-[0.98]',
          added
            ? 'bg-success text-white'
            : plan.popular
              ? 'liquid-glass-accent liquid-sheen text-white hover:brightness-110'
              : 'bg-secondary text-white hover:bg-[#16305a]'
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
