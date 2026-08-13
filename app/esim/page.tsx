'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, Globe, Search, Sparkles } from 'lucide-react';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { CountryCard } from '@/components/esim/CountryCard';
import { RegionCard } from '@/components/esim/RegionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  coverageStats,
  globalReachPlans,
  regionalBundles,
  servedCountries,
  topDestinations,
  wideCoverageCountryPlans,
} from '@/data/coverage';
import { cn } from '@/lib/utils';

// The store used to be one flat grid of 29 destination SKUs, which is the
// supplier's filing system rather than the customer's question. These four
// tabs are the four ways someone actually shops: what do people buy, does it
// work where I'm going, I'm doing a multi-country trip, I'm going far.
const TABS = [
  { id: 'top', label: 'Top destinations' },
  { id: 'countries', label: 'Countries' },
  { id: 'regions', label: 'Regions' },
  { id: 'global', label: 'Global' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const REGION_FILTERS = [
  'All',
  'Southeast Asia',
  'East Asia',
  'Asia',
  'Europe',
  'Americas',
  'Middle East',
  'Oceania',
] as const;
type RegionFilter = (typeof REGION_FILTERS)[number];

export default function EsimStorePage() {
  const [tab, setTab] = useState<Tab>('top');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<RegionFilter>('All');

  const q = query.trim().toLowerCase();

  const filteredCountries = useMemo(
    () =>
      servedCountries.filter((c) => {
        const matchesRegion = region === 'All' || c.region === region;
        const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.nameKm.includes(query.trim());
        return matchesRegion && matchesQuery;
      }),
    [q, query, region]
  );

  const filteredTop = useMemo(
    () =>
      topDestinations.filter((d) => {
        const matchesRegion = region === 'All' || d.region === region;
        const matchesQuery = !q || d.name.toLowerCase().includes(q) || d.nameKm.includes(query.trim());
        return matchesRegion && matchesQuery;
      }),
    [q, query, region]
  );

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
            Data in <span className="font-semibold text-white">{coverageStats.countries} countries</span>, from{' '}
            {coverageStats.destinations} plans. Buy now, scan the QR, and connect the moment you land.
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

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Browse by">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-smooth',
                tab === item.id
                  ? 'border border-gold-light/50 bg-gold-light/15 text-gold-light shadow-sm'
                  : 'border border-white/10 bg-white/5 text-white/70 hover:border-gold-light/40 hover:text-white'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search and region filter only apply to the two country-shaped tabs.
            Filtering a four-card Global tab by region is noise. */}
        {(tab === 'top' || tab === 'countries') && (
          <>
            <form
              className="mb-6 flex max-w-xl gap-2"
              onSubmit={(e) => e.preventDefault()}
              role="search"
              aria-label="Search destinations"
            >
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search any country..."
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

            <div className="mb-10 flex flex-wrap gap-2" role="tablist" aria-label="Filter by region">
              {REGION_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={region === f}
                  onClick={() => setRegion(f)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-smooth',
                    region === f
                      ? 'border border-gold-light/50 bg-gold-light/15 text-gold-light shadow-sm'
                      : 'border border-white/10 bg-white/5 text-white/70 hover:border-gold-light/40 hover:text-white'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </>
        )}

        {/* This tab used to be Explore. Someone who tapped the third slot out of
            habit now lands here, so the store says where the guides went. */}
        <Link
          href="/explore"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-white/55 underline underline-offset-4 transition-colors hover:text-white"
        >
          <Compass size={15} aria-hidden="true" />
          Looking for destination guides? Explore them here
        </Link>

        {tab === 'top' && (
          <Section
            title="What Cambodians buy most"
            description="The destinations that move first every month."
          >
            {filteredTop.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
                {filteredTop.map((dest) => (
                  <DestinationCard key={dest.slug} destination={dest} dark />
                ))}
              </div>
            ) : (
              <NoResults query={query} />
            )}
          </Section>
        )}

        {tab === 'countries' && (
          <Section
            title={`Every country we cover — ${coverageStats.countries} of them`}
            description="Including the ones that have no plan of their own. Italy, Portugal and Norway are all on the Europe eSIM; the card tells you which plan you're buying."
          >
            {filteredCountries.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
                {filteredCountries.map((country) => (
                  <CountryCard key={country.iso2} country={country} />
                ))}
              </div>
            ) : (
              <NoResults query={query} />
            )}
          </Section>
        )}

        {tab === 'regions' && (
          <>
            <Section
              title="Multi-country plans"
              description="One eSIM across a whole trip. For a Bangkok–Singapore–KL run this beats buying three."
            >
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regionalBundles.map((dest) => (
                  <RegionCard key={dest.slug} destination={dest} />
                ))}
              </div>
            </Section>

            {wideCoverageCountryPlans.length > 0 && (
              <Section
                title="Country plans that roam"
                description="Filed under one country by our supplier, but valid across many. The France eSIM is the clearest example — it works in 32 countries."
                className="mt-14"
              >
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {wideCoverageCountryPlans.map((dest) => (
                    <RegionCard key={dest.slug} destination={dest} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'global' && (
          <Section
            title="Widest coverage we sell"
            description="Every plan that crosses a border three times or more, widest first."
          >
            <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {globalReachPlans.map((dest) => (
                <RegionCard key={dest.slug} destination={dest} />
              ))}
            </div>

            {/* Rule 8: never invent a supplier product. There is no worldwide
                SKU in the GoHub price list, so the tab says so rather than
                selling a plan that does not exist. */}
            <p className="mt-8 max-w-2xl rounded-card border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              We don&rsquo;t yet sell a single worldwide eSIM — our supplier&rsquo;s catalogue has no
              such plan. The widest we can put on one eSIM today is{' '}
              {coverageStats.widestPlan?.countries ?? 0} countries. Travelling somewhere not listed
              anywhere in the store?{' '}
              <Link href="/help/esim" className="text-gold-light underline underline-offset-4">
                Ask us
              </Link>{' '}
              — we can often source it.
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      <p className="mb-6 mt-1.5 max-w-2xl text-sm text-white/60">{description}</p>
      {children}
    </section>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Globe}
      title="No destinations found"
      description={`We couldn't find "${query}". Try another country name or clear your filters.`}
      ctaLabel="Clear search"
      ctaHref="/esim"
      dark
    />
  );
}
