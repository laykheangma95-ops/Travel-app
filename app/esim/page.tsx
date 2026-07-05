'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
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
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">eSIM Store</h1>
        <p className="mt-3 text-ink-secondary">
          Instant data for 150+ countries. Buy now, scan the QR, and connect the moment you land.
        </p>
      </div>

      {/* Search */}
      <form
        className="mb-6 flex max-w-xl gap-2"
        onSubmit={(e) => e.preventDefault()}
        role="search"
        aria-label="Search destinations"
      >
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search destination..."
            aria-label="Search destination"
            className="w-full rounded-btn border border-line bg-white py-3 pl-11 pr-4 text-sm transition-all focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
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
                ? 'bg-secondary text-white shadow-sm'
                : 'bg-white text-ink-secondary border border-line hover:border-secondary hover:text-secondary'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((dest) => (
            <DestinationCard key={dest.slug} destination={dest} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Globe}
          title="No destinations found"
          description={`We couldn't find "${query}". Try another country name or clear your filters.`}
          ctaLabel="Clear search"
          ctaHref="/esim"
        />
      )}
    </div>
  );
}
