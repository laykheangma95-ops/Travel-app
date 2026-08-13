'use client';

import Link from 'next/link';
import type { Destination } from '@/types';
import { coverageFor } from '@/data/coverage';
import { useLang } from '@/lib/i18n';

/**
 * A multi-country plan in the Regions / Global tabs.
 *
 * The headline is the country count, not the country name. GoHub file their
 * roaming SKUs under a single country — the "France" plan works in 32 — and a
 * card that says "France" is a card that undersells the product.
 */
export function RegionCard({ destination }: { destination: Destination }) {
  const { t } = useLang();
  const countries = coverageFor(destination.slug);
  const preview = countries.slice(0, 8);
  const remaining = countries.length - preview.length;

  return (
    <Link href={`/esim/${destination.slug}`} className="group night-card relative flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-white">{destination.name}</h3>
          <p className="font-khmer text-sm text-white/60">{destination.nameKm}</p>
        </div>
        <span className="shrink-0 rounded-full border border-gold-light/40 bg-gold-light/10 px-3 py-1 text-xs font-bold text-gold-light">
          {countries.length} countries
        </span>
      </div>

      <ul className="mt-4 flex flex-wrap gap-1.5">
        {preview.map((country) => (
          <li
            key={country.iso2}
            className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/70"
          >
            <span aria-hidden="true">{country.flag}</span>
            {country.name}
          </li>
        ))}
        {remaining > 0 && (
          <li className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50">
            +{remaining} more
          </li>
        )}
      </ul>

      <p className="mt-auto pt-4 text-sm font-bold text-gold-light">
        {t('dest.from')} ${destination.fromPriceUsd.toFixed(2)}
      </p>
    </Link>
  );
}
