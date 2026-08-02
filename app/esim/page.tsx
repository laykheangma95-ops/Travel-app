'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

// Derived from the catalogue rather than hand-listed. The hardcoded list had
// drifted from the data: it omitted Oceania, so that destination could not be
// reached by any filter, and it offered regions with nothing behind them.
// Deriving it means the tabs can never fall out of sync with data/destinations.
const REGION_ORDER = [
  'Southeast Asia',
  'East Asia',
  'Asia',
  'Europe',
  'Americas',
  'Middle East',
  'Oceania',
] as const;

const FILTERS = [
  'All',
  ...REGION_ORDER.filter((r) => destinations.some((d) => d.region === r)),
] as const;

type Filter = (typeof FILTERS)[number];

export default function EsimStorePage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const filtered = useMemo(() => {
    return destinations.filter((d) => {
      const matchesFilter = filter === 'All' || d.region === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || d.name.toLowerCase().includes(q) || d.nameKm.includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [query, filter]);

  return (
    // One continuous night sky — the funnel keeps the home's cinematic surface
    // rather than dropping into flat light SaaS (see .claude/skills/ui-ux §9).
    <div className="night-canvas min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Global data</p>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">eSIM Store</h1>
          {/* This line promised "150+ countries" directly above a grid of 21,
              so the page appeared to contradict itself at the moment of choice.
              The wider catalogue may well exist upstream at the supplier — but
              this heading should describe what is bookable here, today. */}
          <p className="mt-3 text-white/70">
            Instant data for {destinations.length} destinations, live now. Buy before you fly, scan
            the QR, and land already connected.
          </p>
        </div>

        {/* Search — results filter as you type, so there is no submit button to
            press. The old one implied the list would not update until you did. */}
        <form
          className="mb-6 max-w-xl"
          onSubmit={(e) => e.preventDefault()}
          role="search"
          aria-label="Search destinations"
        >
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search destination..."
              aria-label="Search destination"
              className="w-full rounded-btn border border-gold-light/20 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/40 backdrop-blur-md transition-all focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/25"
            />
          </div>
        </form>

        {/* Filter row. These are toggles, not tabs — the previous role="tablist"
            promised tabpanels that do not exist, which misleads a screen reader. */}
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by region">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'min-h-[2.75rem] rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-smooth',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep',
                filter === f
                  ? 'border border-gold-light/50 bg-gold-light/15 text-gold-light shadow-sm'
                  : 'border border-white/10 bg-white/5 text-white/70 hover:border-gold-light/40 hover:text-white'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Live result count — tells a filtering visitor the list actually
            responded, and gives the search a polite screen-reader announcement. */}
        <p className="mb-8 text-sm text-white/55" role="status" aria-live="polite">
          {filtered.length === destinations.length
            ? `${destinations.length} destinations`
            : `${filtered.length} of ${destinations.length} destinations`}
        </p>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((dest) => (
              <DestinationCard key={dest.slug} destination={dest} dark />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Globe}
            title="No destinations found"
            description={
              query
                ? `We don't have a plan for "${query}" yet. Tell our Khmer support team where you're headed and we'll source one.`
                : 'No destinations match this region yet.'
            }
            // Actually resets the search and region rather than linking back to
            // the same page, which left both filters exactly as they were.
            ctaLabel="Clear search and filters"
            onCtaClick={() => {
              setQuery('');
              setFilter('All');
            }}
            dark
          />
        )}
      </div>
    </div>
  );
}
