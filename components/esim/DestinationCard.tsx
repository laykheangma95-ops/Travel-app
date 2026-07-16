'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Destination } from '@/types';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

export function DestinationCard({ destination }: { destination: Destination }) {
  const { t } = useLang();
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = Boolean(destination.image) && !imgFailed;

  return (
    <Link
      href={`/esim/${destination.slug}`}
      aria-label={`${destination.name} — ${t('dest.viewPlans')}`}
      className="group relative block aspect-[3/4] overflow-hidden rounded-[26px] bg-primary-deep shadow-card ring-1 ring-white/10 transition-all duration-500 ease-smooth hover:-translate-y-1.5 hover:shadow-card-hover hover:ring-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* ── Landscape HD hero photo (fills the card, biggest possible) ──────── */}
      <div className="absolute inset-0">
        {/* Brand gradient — the graceful fallback that always looks premium */}
        <div className="absolute inset-0 bg-[radial-gradient(130%_110%_at_20%_10%,#24406b_0%,#14263f_48%,#0b1424_100%)]" />
        {showPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={destination.image}
            alt={`${destination.name} — ${destination.tagline ?? 'iconic view'}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1100ms] ease-smooth group-hover:scale-[1.08]"
          />
        )}
        {!showPhoto && (
          <span className="absolute inset-0 flex items-center justify-center text-[5.5rem] opacity-90 drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
            {destination.flag}
          </span>
        )}
        {/* Cinematic scrim — keeps the glass caption and top badges legible */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-deep via-primary-deep/25 to-primary-deep/40" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" />
      </div>

      {/* ── Top row: flag medallion + live network pill ────────────────────── */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3.5">
        <WavyFlag
          flag={destination.flag}
          label={`${destination.name} flag`}
          size={46}
          className="origin-top-left transition-transform duration-300 ease-smooth group-hover:-rotate-3 group-hover:scale-110"
        />
        <span className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              destination.networkQuality === 'Excellent'
                ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.9)]'
                : 'bg-warning shadow-[0_0_8px_rgba(245,158,11,0.9)]'
            }`}
          />
          {destination.networkTech}
        </span>
      </div>

      {/* ── Floating liquid-glass caption ──────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <div className="liquid-glass rounded-[20px] p-4">
          {destination.tagline && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-bright/90">
              {destination.tagline}
            </p>
          )}
          <h3 className="font-display text-[1.35rem] font-bold leading-tight text-white drop-shadow-sm">
            {destination.name}
          </h3>
          <p className="font-khmer text-xs text-white/70">{destination.nameKm}</p>

          <div className="mt-3.5 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/55">
                {t('dest.from')}
              </p>
              <p className="font-display text-lg font-bold text-gold-bright">
                ${destination.fromPriceUsd.toFixed(2)}
              </p>
            </div>
            <span className="liquid-glass-accent inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-primary-deep transition-all duration-300 ease-smooth group-hover:gap-2.5">
              {t('dest.viewPlans')}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-300 ease-smooth group-hover:translate-x-0.5"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
