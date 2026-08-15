'use client';

// ExploreCard — a destination, art-directed.
//
// NOT a new illustration set: it reuses `DestinationScene`, the bespoke SVG
// skyline already drawn for each guide, plus that guide's own arrival sky
// colours. So a card is a small window onto the same night the destination page
// opens into — which is the continuity rule (§9.1) doing real work rather than
// being asserted.
//
// Named ExploreCard because components/esim/DestinationCard.tsx already exists
// and does a different job: it sells a plan and leads with a price. This one
// leads with a place.

import Link from 'next/link';
import { ArrowUpRight, Plane } from 'lucide-react';
import { DestinationScene } from '@/components/home/v3/destinationScene';
import type { DestinationGuide } from '@/content/schema';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function ExploreCard({
  guide,
  index = 0,
  className,
}: {
  guide: DestinationGuide;
  index?: number;
  className?: string;
}) {
  const { lang } = useLang();

  const flightTime =
    guide.directFlightMins !== null
      ? lang === 'km'
        ? `${Math.floor(guide.directFlightMins / 60)}ម ${guide.directFlightMins % 60}ន ដោយផ្ទាល់`
        : `${Math.floor(guide.directFlightMins / 60)}h ${guide.directFlightMins % 60}m direct`
      : lang === 'km'
        ? 'គ្មានជើងហោះហើរផ្ទាល់'
        : 'No direct flight';

  return (
    <Link
      href={`/destination/${guide.slug}`}
      className={cn(
        'deck-item interaction-card group relative block overflow-hidden rounded-card border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
        className
      )}
      style={{ '--deck-index': index } as React.CSSProperties}
    >
      {/* The art. Decorative and aria-hidden — the place is named in text. */}
      <DestinationScene
        slug={guide.slug}
        skyColor={guide.arrival.skyColor}
        horizonColor={guide.arrival.horizonColor}
        className="relative h-44 w-full overflow-hidden transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] sm:h-52"
      />

      {/* Scrim, so the type holds its contrast over any sky the guide chose. */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#070f22] via-[#070f22]/80 to-transparent"
        aria-hidden="true"
      />

      <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="block text-[11px] font-semibold uppercase tracking-widest text-gold-light">
          {guide.country[lang]}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 font-display text-2xl text-white">
          {guide.city[lang]}
          <ArrowUpRight
            size={16}
            aria-hidden="true"
            className="opacity-0 transition-all duration-300 ease-smooth group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-white/60">
          <Plane size={12} aria-hidden="true" />
          {flightTime}
        </span>
      </span>
    </Link>
  );
}
