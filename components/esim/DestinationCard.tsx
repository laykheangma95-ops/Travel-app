'use client';

import Link from 'next/link';
import type { Destination } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

export function DestinationCard({ destination }: { destination: Destination }) {
  const { t } = useLang();

  return (
    <Link
      href={`/esim/${destination.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-300 ease-smooth hover:-translate-y-1.5 hover:border-accent/40 hover:bg-white/[0.07] hover:shadow-[0_18px_48px_rgba(0,0,0,0.5)]"
    >
      {/* ── Liquid glass sheen layers ── */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_45%)] opacity-70"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-12 -top-24 h-44 rotate-12 bg-white/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.1rem] border border-accent/40 bg-[#152A47]/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_6px_16px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3">
        <WavyFlag flag={destination.flag} label={`${destination.name} flag`} size={44} />
      </div>
      <h3 className="relative mt-4 font-display text-lg font-bold text-white">{destination.name}</h3>
      <p className="relative font-khmer text-sm text-white/60">ចូលទស្សនា{destination.nameKm}</p>
      <div className="relative mt-4 flex items-center justify-between">
        <p className="text-sm font-bold text-accent">
          {t('dest.from')} ${destination.fromPriceUsd.toFixed(2)}
        </p>
        <Badge tone={destination.networkQuality === 'Excellent' ? 'success' : 'info'}>
          {destination.networkQuality}
        </Badge>
      </div>
      <span className="relative mt-4 inline-flex items-center justify-center rounded-btn border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent opacity-0 backdrop-blur-md transition-all duration-300 ease-smooth group-hover:opacity-100">
        {t('dest.viewPlans')}
      </span>
    </Link>
  );
}
