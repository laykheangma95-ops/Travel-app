'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, Search, Sparkles } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const FILTERS = ['All', 'Asia', 'East Asia', 'Southeast Asia', 'Europe', 'Americas', 'Middle East'] as const;
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
          <p className="mt-3 text-white/70">
            Instant data for the places Cambodians fly. Buy now, scan the QR, and connect the moment you land.
          </p>
        </div>

        {/* The guided route in.
            Placed above the search because "which country" is the easy question
            and "how many gigabytes" is the one that stalls people — someone who
            already knows their destination still may not know their plan. */}
        <Link
          href="/esim/finder"
          className="group mb-6 flex items-center gap-4 rounded-card border border-gold-light/30 bg-gradient-to-br from-gold-light/12 to-white/5 p-4 backdrop-blur-md transition-all duration-200 ease-smooth hover:border-gold-light/60 sm:p-5"
        >
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-light/20 text-gold-light"
            aria-hidden="true"
          >
            <Sparkles size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-white">
              Not sure how much data you need?
            </span>
            <span className="mt-0.5 block text-sm text-white/65">
              Answer three quick questions and we&rsquo;ll pick a plan for you.
            </span>
          </span>
          <ArrowRight
            size={18}
            className="shrink-0 text-gold-light transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>

        {/* Search */}
        <form
          className="mb-6 flex max-w-xl gap-2"
          onSubmit={(e) => e.preventDefault()}
          role="search"
          aria-label="Search destinations"
        >
          <div className="relative flex-1">
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
          <button
            type="submit"
            className="liquid-glass-accent liquid-press rounded-btn px-5 py-3 text-sm font-semibold text-primary-deep transition-all hover:brightness-110"
            aria-label="Search"
          >
            <Search size={18} />
          </button>
        </form>

        {/* Filter tabs */}
        <div className="mb-10 flex flex-wrap gap-2" role="tablist" aria-label="Filter by region">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-smooth',
                filter === f
                  ? 'border border-gold-light/50 bg-gold-light/15 text-gold-light shadow-sm'
                  : 'border border-white/10 bg-white/5 text-white/70 hover:border-gold-light/40 hover:text-white'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* This tab used to be Explore. Someone who tapped the third slot out of
            habit now lands here, so the store says where the guides went. */}
        <Link
          href="/explore"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-white/55 underline underline-offset-4 transition-colors hover:text-white"
        >
          <Compass size={15} aria-hidden="true" />
          Looking for destination guides? Explore them here
        </Link>

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
            description={`We couldn't find "${query}". Try another country name or clear your filters.`}
            ctaLabel="Clear search"
            ctaHref="/esim"
            dark
          />
        )}
      </div>
    </div>
  );
}
