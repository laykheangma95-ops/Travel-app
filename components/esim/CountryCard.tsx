'use client';

import Link from 'next/link';
import type { ServedCountry } from '@/data/coverage';
import { getDestination } from '@/data/destinations';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

/**
 * A country in the Countries tab.
 *
 * Deliberately not DestinationCard: most of these countries have no SKU of
 * their own, so the card's job is to say "yes, we cover you — through this
 * plan" rather than to pretend a dedicated product exists.
 */
export function CountryCard({ country }: { country: ServedCountry }) {
  const { t } = useLang();
  const via = country.hasDedicatedPlan ? null : getDestination(country.servedBy[0]);

  return (
    <Link
      href={`/esim/${country.slug}`}
      className="group night-card relative flex h-full flex-col p-5"
    >
      <WavyFlag
        flag={country.flag}
        label={`${country.name} flag`}
        size={48}
        className="origin-bottom-left transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3"
      />
      <h3 className="mt-3 font-display text-base font-bold leading-tight text-white">{country.name}</h3>
      <p className="font-khmer text-sm text-white/60">{country.nameKm}</p>

      {via && (
        // The honest bit. Someone buying data for Italy is buying the Europe
        // plan, and finding that out at checkout instead of here is how you
        // get a refund request.
        <p className="mt-2 text-xs text-white/45">
          Covered by the{' '}
          <span className="text-white/70">{via.name}</span> plan
        </p>
      )}

      <p className="mt-auto pt-3 text-sm font-bold text-gold-light">
        {t('dest.from')} ${country.fromPriceUsd.toFixed(2)}
      </p>
    </Link>
  );
}
