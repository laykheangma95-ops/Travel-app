'use client';

// ─────────────────────────────────────────────────────────────────────────────
// EXPLORE — immersive, editorial, and honest about what we have written.
//
// §18 asks for visual storytelling rather than a marketplace grid. So the shape
// is: one large lead destination, then a set of full-bleed cards, then the
// eSIM-only countries as a compact strip — clearly labelled as places we sell a
// connection for but have not written a guide for yet.
//
// That last distinction is the whole reason this page is not a 40-tile grid. The
// repo already refuses to auto-generate thin guides (content/destinations/
// index.ts), and Explore respects that: a written place gets a full card, an
// unwritten one gets a truthful chip.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search, Sparkles } from 'lucide-react';
import { guides } from '@/content/destinations';
import { destinations } from '@/data/destinations';
import { ExploreCard } from './ExploreCard';
import { DestinationScene } from '@/components/home/v3/destinationScene';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Lens = 'all' | 'short' | 'popular';

export function ExploreView() {
  const { lang } = useLang();
  const [query, setQuery] = useState('');
  const [lens, setLens] = useState<Lens>('all');

  // routeWeight is hand-set editorial judgement about the routes Cambodians
  // actually fly — the right ordering for a Cambodian-first product, and never
  // shown as a number.
  const ranked = useMemo(() => [...guides].sort((a, b) => b.routeWeight - a.routeWeight), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ranked.filter((guide) => {
      if (lens === 'short' && (guide.directFlightMins === null || guide.directFlightMins > 240)) {
        return false;
      }
      if (lens === 'popular' && guide.routeWeight < 7) return false;
      if (!needle) return true;
      return [guide.city.en, guide.city.km, guide.country.en, guide.country.km, ...guide.aliases].some(
        (field) => field.toLowerCase().includes(needle)
      );
    });
  }, [ranked, query, lens]);

  const [lead, ...rest] = filtered;

  // Countries we sell an eSIM for but have not written up. Named honestly.
  const esimOnly = useMemo(() => {
    const written = new Set(guides.map((guide) => guide.esimCountrySlug));
    return destinations.filter((country) => !written.has(country.slug));
  }, []);

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {lang === 'km' ? 'ស្វែងរក' : 'Explore'}
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl" style={{ textWrap: 'balance' } as React.CSSProperties}>
            {lang === 'km' ? 'កន្លែងដែលខ្មែរហោះទៅ' : 'Where Cambodians actually fly'}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
            {lang === 'km'
              ? 'គោលដៅដែលយើងបានសរសេរយ៉ាងលម្អិត — លក្ខខណ្ឌចូល តម្លៃពិត ការធ្វើដំណើរ និងការតភ្ជាប់។'
              : 'Seven destinations written up properly — entry rules for a Cambodian passport, real local prices, transport and connectivity.'}
          </p>

          {/* Explore is where someone decides they are going. Until this
              existed, /trips/new was reachable from exactly one button in the
              whole product and this page could only send you to a guide. */}
          <Link
            href="/trips/new"
            className="mt-4 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-gold-light/40 px-4 text-sm font-semibold text-gold-bright transition-colors duration-200 ease-smooth hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <Sparkles size={15} aria-hidden="true" />
            {lang === 'km' ? 'ចាប់ផ្តើមដំណើរថ្មី' : 'Start a trip'}
          </Link>
        </header>

        {/* Search + lenses. One row on desktop, stacked on a phone. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
              aria-hidden="true"
            />
            <label htmlFor="explore-search" className="sr-only">
              {lang === 'km' ? 'ស្វែងរកគោលដៅ' : 'Search destinations'}
            </label>
            <input
              id="explore-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={lang === 'km' ? 'បាងកក តូក្យូ សិង្ហបុរី…' : 'Bangkok, Tokyo, Singapore…'}
              className="min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] pl-10 pr-3 text-sm text-white placeholder:text-white/35 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
            />
          </div>

          <div className="flex gap-2" role="group" aria-label={lang === 'km' ? 'តម្រង' : 'Filter'}>
            {(
              [
                { key: 'all', label: { en: 'All', km: 'ទាំងអស់' } },
                { key: 'short', label: { en: 'Short hops', km: 'ដំណើរខ្លី' } },
                { key: 'popular', label: { en: 'Most flown', km: 'ហោះច្រើន' } },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setLens(option.key)}
                aria-pressed={lens === option.key}
                className={cn(
                  'min-h-[2.75rem] shrink-0 rounded-btn border px-3.5 text-sm font-medium transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
                  lens === option.key
                    ? 'border-gold-light/50 bg-accent/18 text-gold-bright'
                    : 'border-white/12 bg-white/[0.04] text-white/65 hover:border-white/25 hover:text-white'
                )}
              >
                {option.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="night-card mt-8 p-8 text-center">
            <h2 className="font-display text-xl text-white">
              {lang === 'km' ? 'យើងមិនទាន់សរសេរអំពីកន្លែងនេះទេ' : "We haven't written that one up yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'យើងសរសេរតែគោលដៅដែលយើងបានពិនិត្យផ្ទាល់។ អ្នកអាចរកមើល eSIM សម្រាប់ប្រទេសផ្សេងទៀត។'
                : 'We only publish guides we have checked ourselves. You can still find an eSIM for most countries.'}
            </p>
            <Link
              href="/esim"
              className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
            >
              {lang === 'km' ? 'មើល eSIM' : 'Browse eSIMs'}
            </Link>
          </div>
        ) : (
          <>
            {/* The lead. Full-bleed art, the guide's own arrival sky, its own
                opening line — the same material the destination page opens with. */}
            {lead && (
              <Link
                href={`/destination/${lead.slug}`}
                className="deck-item group relative mt-8 block overflow-hidden rounded-card border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              >
                <DestinationScene
                  slug={`lead-${lead.slug}`}
                  skyColor={lead.arrival.skyColor}
                  horizonColor={lead.arrival.horizonColor}
                  className="relative h-72 w-full overflow-hidden transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02] sm:h-96"
                />
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#070f22] via-[#070f22]/85 to-transparent"
                  aria-hidden="true"
                />
                <span className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
                  <span className="block text-[11px] font-semibold uppercase tracking-widest text-gold-light">
                    {lang === 'km' ? 'ចាប់ផ្តើមនៅទីនេះ' : 'Start here'} · {lead.country[lang]}
                  </span>
                  <span className="mt-1 flex items-center gap-2 font-display text-4xl text-white sm:text-5xl">
                    {lead.city[lang]}
                    <ArrowUpRight
                      size={22}
                      aria-hidden="true"
                      className="transition-transform duration-300 ease-smooth group-hover:translate-x-1 group-hover:-translate-y-1"
                    />
                  </span>
                  <span className="mt-2 block max-w-xl text-sm leading-relaxed text-white/75">
                    {lead.arrival.intro[lang]}
                  </span>
                </span>
              </Link>
            )}

            {rest.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((guide, index) => (
                  <ExploreCard key={guide.slug} guide={guide} index={index} />
                ))}
              </div>
            )}
          </>
        )}

        {/* eSIM-only countries. A truthful strip, not a fake guide. */}
        {esimOnly.length > 0 && (
          <section className="mt-14" aria-labelledby="esim-only">
            <h2 id="esim-only" className="font-display text-2xl text-white">
              {lang === 'km' ? 'ភ្ជាប់នៅកន្លែងផ្សេងទៀត' : 'Stay connected elsewhere'}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/60">
              {lang === 'km'
                ? 'យើងលក់ eSIM សម្រាប់ប្រទេសទាំងនេះ ប៉ុន្តែមិនទាន់សរសេរមគ្គុទ្ទេសក៍ពេញលេញទេ។'
                : 'We sell an eSIM for these, but have not written the full guide yet.'}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {esimOnly.map((country) => (
                <li key={country.slug}>
                  <Link
                    href={`/esim/${country.slug}`}
                    className="flex min-h-[2.5rem] items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white/75 transition-colors duration-200 ease-smooth hover:border-gold-light/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                  >
                    <span aria-hidden="true">{country.flag}</span>
                    {lang === 'km' ? country.nameKm : country.name}
                    <span className="font-mono text-xs text-white/45">
                      ${country.fromPriceUsd.toFixed(2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* One route into the Copilot, at the bottom, where someone who did not
            find what they wanted actually is. */}
        <div className="night-card mt-12 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-light/30 bg-accent/15 text-gold-light"
            aria-hidden="true"
          >
            <Sparkles size={16} />
          </span>
          <p className="flex-1 text-sm leading-relaxed text-white/75">
            {lang === 'km'
              ? 'មិនដឹងទៅណា? សួរ Domner អំពីលក្ខខណ្ឌចូល ថវិកា ឬពេលវេលាល្អបំផុត។'
              : 'Not sure where? Ask Domner about entry rules, budgets, or the best time to go.'}
          </p>
          <Link
            href="/checklist"
            className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-gold-light/40 px-4 text-sm font-semibold text-gold-bright transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            {lang === 'km' ? 'រៀបចំដំណើរ' : 'Plan a trip'}
          </Link>
        </div>
      </div>
    </div>
  );
}
