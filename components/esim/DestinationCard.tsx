'use client';

import Link from 'next/link';
import type { Destination } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

export function DestinationCard({ destination, dark = false }: { destination: Destination; dark?: boolean }) {
  const { t } = useLang();

  return (
    <Link
      href={`/esim/${destination.slug}`}
      className={
        dark
          ? 'group night-card relative flex h-full flex-col p-6'
          : 'group relative flex h-full flex-col rounded-card border border-line/60 bg-white p-6 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:border-accent hover:shadow-card-hover'
      }
    >
      <WavyFlag
        flag={destination.flag}
        label={`${destination.name} flag`}
        size={60}
        className="origin-bottom-left transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3"
      />
      <h3 className={`mt-4 font-display text-lg font-bold ${dark ? 'text-white' : 'text-ink'}`}>{destination.name}</h3>
      <p className={`font-khmer text-sm ${dark ? 'text-white/60' : 'text-ink-secondary'}`}>ចូលទស្សនា{destination.nameKm}</p>
      <div className="mt-4 flex items-center justify-between">
        <p className={`text-sm font-bold ${dark ? 'text-gold-light' : 'text-accent'}`}>
          {t('dest.from')} ${destination.fromPriceUsd.toFixed(2)}
        </p>
        <Badge tone={destination.networkQuality === 'Excellent' ? 'success' : 'info'}>
          {destination.networkQuality}
        </Badge>
      </div>
      <span
        className={
          dark
            ? 'mt-4 inline-flex items-center justify-center rounded-btn border border-gold-light/40 bg-gold-light/10 px-4 py-2 text-sm font-semibold text-gold-light opacity-0 transition-opacity duration-200 group-hover:opacity-100'
            : 'mt-4 inline-flex items-center justify-center rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100'
        }
      >
        {t('dest.viewPlans')}
      </span>
    </Link>
  );
}
