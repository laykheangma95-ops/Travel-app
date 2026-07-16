'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Destination } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

interface DestinationCardProps {
  destination: Destination;
  /**
   * `light` (default) — white card for light pages such as /esim.
   * `glass`           — frosted glass card for the dark Temple-Night home canvas.
   */
  variant?: 'light' | 'glass';
}

export function DestinationCard({ destination, variant = 'light' }: DestinationCardProps) {
  const { t } = useLang();

  if (variant === 'glass') {
    return (
      <Link
        href={`/esim/${destination.slug}`}
        className="glass-card liquid-sheen group flex h-full flex-col p-6"
      >
        <WavyFlag
          flag={destination.flag}
          label={`${destination.name} flag`}
          size={60}
          className="origin-bottom-left transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3"
        />
        <h3 className="mt-4 font-display text-lg font-bold text-white">{destination.name}</h3>
        <p className="font-khmer text-sm text-white/55">ចូលទស្សនា{destination.nameKm}</p>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-bold text-gold-light">
            {t('dest.from')} ${destination.fromPriceUsd.toFixed(2)}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              destination.networkQuality === 'Excellent'
                ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-300'
                : 'border-sky-300/30 bg-sky-400/10 text-sky-300'
            }`}
          >
            {destination.networkQuality}
          </span>
        </div>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light opacity-0 transition-all duration-300 group-hover:gap-2.5 group-hover:opacity-100">
          {t('dest.viewPlans')} <ArrowRight size={14} aria-hidden="true" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/esim/${destination.slug}`}
      className="group relative flex h-full flex-col rounded-card border border-line/60 bg-white p-6 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:border-accent hover:shadow-card-hover"
    >
      <WavyFlag
        flag={destination.flag}
        label={`${destination.name} flag`}
        size={60}
        className="origin-bottom-left transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3"
      />
      <h3 className="mt-4 font-display text-lg font-bold text-ink">{destination.name}</h3>
      <p className="font-khmer text-sm text-ink-secondary">ចូលទស្សនា{destination.nameKm}</p>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-bold text-accent">
          {t('dest.from')} ${destination.fromPriceUsd.toFixed(2)}
        </p>
        <Badge tone={destination.networkQuality === 'Excellent' ? 'success' : 'info'}>
          {destination.networkQuality}
        </Badge>
      </div>
      <span className="mt-4 inline-flex items-center justify-center rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {t('dest.viewPlans')}
      </span>
    </Link>
  );
}
