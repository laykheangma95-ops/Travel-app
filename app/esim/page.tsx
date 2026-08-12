'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang, type DictKey } from '@/lib/i18n';

// The region string is the filter VALUE — it matches `destination.region` in
// data/ — so it stays English. Only the label beside it is translated.
const FILTERS = [
  { value: 'All', key: 'store.filter.All' },
  { value: 'Asia', key: 'store.filter.Asia' },
  { value: 'East Asia', key: 'store.filter.EastAsia' },
  { value: 'Southeast Asia', key: 'store.filter.SoutheastAsia' },
  { value: 'Europe', key: 'store.filter.Europe' },
  { value: 'Americas', key: 'store.filter.Americas' },
  { value: 'Middle East', key: 'store.filter.MiddleEast' },
] as const satisfies ReadonlyArray<{ value: string; key: DictKey }>;

type Filter = (typeof FILTERS)[number]['value'];

export default function EsimStorePage() {
  const { t } = useLang();
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
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">
            {t('store.eyebrow')}
          </p>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">{t('store.title')}</h1>
          <p className="mt-3 text-white/70">{t('store.sub')}</p>
        </div>

        {/* Search */}
        <form
          className="mb-6 flex max-w-xl gap-2"
          onSubmit={(e) => e.preventDefault()}
          role="search"
          aria-label={t('store.searchRegion')}
        >
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('store.searchPlaceholder')}
              aria-label={t('store.searchRegion')}
              className="w-full rounded-btn border border-gold-light/20 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/40 backdrop-blur-md transition-all focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/25"
            />
          </div>
          <button
            type="submit"
            className="liquid-glass-accent liquid-press rounded-btn px-5 py-3 text-sm font-semibold text-primary-deep transition-all hover:brightness-110"
            aria-label={t('store.search')}
          >
            <Search size={18} />
          </button>
        </form>

        {/* Filter tabs */}
        <div className="mb-10 flex flex-wrap gap-2" role="tablist" aria-label={t('store.filterLabel')}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-smooth',
                filter === f.value
                  ? 'border border-gold-light/50 bg-gold-light/15 text-gold-light shadow-sm'
                  : 'border border-white/10 bg-white/5 text-white/70 hover:border-gold-light/40 hover:text-white'
              )}
            >
              {t(f.key)}
            </button>
          ))}
        </div>

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
            title={t('store.empty.title')}
            description={t('store.empty.desc', { query })}
            ctaLabel={t('store.empty.cta')}
            ctaHref="/esim"
            dark
          />
        )}
      </div>
    </div>
  );
}
