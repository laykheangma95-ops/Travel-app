'use client';

// ─────────────────────────────────────────────────────────────────────────────
// WHERE YOUR eSIM WORKS — the full coverage list.
//
// WHY THIS PAGE EXISTS:
//   Explore's "Stay connected elsewhere" strip was built from `destinations`,
//   the list of countries we hold a dedicated SKU for. But data/coverage.ts
//   knows we actually reach 52 countries, because a regional bundle carries far
//   more than its own name — the France SKU alone roams across 32. So 29
//   covered countries were sold nowhere on the site: a traveler going to
//   Austria, Denmark or Ireland was told, in effect, that we had nothing for
//   them. We did.
//
//   Nobody says "I'm going to Malaysia" either — they say Kuala Lumpur. So this
//   searches the 221-city index too, which already carries Khmer spellings and
//   IATA codes as aliases.
//
// HONESTY IS THE POINT:
//   A dedicated plan and roaming coverage are not the same product, and the
//   page says which is which rather than flattening both into a tick. A
//   traveler who arrives expecting a local plan and gets roaming has been
//   misled by us, not by their phone.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe2, Search, X } from 'lucide-react';
import { coveredCities } from '@/data/cities';
import { servedCountries, type ServedCountry } from '@/data/coverage';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Cambodia-first: the regions our travelers actually fly to, first. */
const REGION_ORDER = [
  'Southeast Asia',
  'East Asia',
  'Asia',
  'Middle East',
  'Oceania',
  'Europe',
  'Americas',
] as const;

const REGION_KM: Record<string, string> = {
  'Southeast Asia': 'អាស៊ីអាគ្នេយ៍',
  'East Asia': 'អាស៊ីខាងកើត',
  Asia: 'អាស៊ី',
  'Middle East': 'មជ្ឈិមបូព៌ា',
  Oceania: 'អូសេអានី',
  Europe: 'អឺរ៉ុប',
  Americas: 'អាមេរិក',
};

interface CountryEntry {
  country: ServedCountry;
  /** Every city we index for this country, heaviest (best known) first. */
  cities: { name: string; nameKm?: string }[];
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function CoverageView() {
  const { lang } = useLang();
  const [query, setQuery] = useState('');

  // One pass over the city index, grouped onto the country it points at.
  const entries = useMemo<CountryEntry[]>(() => {
    const byCountry = new Map<string, CountryEntry>();
    for (const country of servedCountries) {
      byCountry.set(country.slug, { country, cities: [] });
    }
    for (const { city, country } of coveredCities) {
      const entry = byCountry.get(country.slug);
      if (entry) entry.cities.push({ name: city.name, nameKm: city.nameKm });
    }
    for (const entry of byCountry.values()) {
      entry.cities.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...byCountry.values()];
  }, []);

  const cityCount = useMemo(
    () => entries.reduce((total, entry) => total + entry.cities.length, 0),
    [entries]
  );

  // A search matches on the country in either script, or on any city we index —
  // including its aliases, which is how an airport code finds its country.
  const matching = useMemo(() => {
    const needle = normalise(query);
    if (!needle) return entries;
    return entries
      .map((entry) => {
        const countryHit =
          normalise(entry.country.name).includes(needle) ||
          entry.country.nameKm.includes(query.trim()) ||
          normalise(entry.country.iso2) === needle;
        const cityHits = entry.cities.filter(
          (city) =>
            normalise(city.name).includes(needle) ||
            (city.nameKm ? city.nameKm.includes(query.trim()) : false)
        );
        if (countryHit) return entry;
        if (cityHits.length) return { ...entry, cities: cityHits };
        return null;
      })
      .filter((entry): entry is CountryEntry => entry !== null);
  }, [entries, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CountryEntry[]>();
    for (const entry of matching) {
      const list = map.get(entry.country.region) ?? [];
      list.push(entry);
      map.set(entry.country.region, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.country.name.localeCompare(b.country.name));
    }
    return REGION_ORDER.filter((region) => map.has(region)).map((region) => ({
      region,
      countries: map.get(region) as CountryEntry[],
    }));
  }, [matching]);

  const searching = query.trim().length > 0;

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-6">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {lang === 'km' ? 'តំបន់ដំណើរការ' : 'eSIM coverage'}
          </p>
          <h1
            className="mt-2 max-w-2xl font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            {lang === 'km' ? 'កន្លែងដែល eSIM របស់អ្នកដំណើរការ' : 'Where your eSIM works'}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
            {lang === 'km'
              ? `${servedCountries.length} ប្រទេស និង ${cityCount} ទីក្រុង។ រកមើលតាមឈ្មោះទីក្រុង ព្រោះគ្មាននរណាគិតជាឈ្មោះប្រទេសទេ។`
              : `${servedCountries.length} countries, ${cityCount} cities. Search by city — nobody thinks in country names.`}
          </p>
        </header>

        {/* The one gold moment on this screen is the focus ring. */}
        <label className="mt-7 flex min-h-[3rem] items-center gap-3 rounded-btn border border-white/12 bg-white/[0.04] px-4 transition-colors duration-200 ease-smooth focus-within:border-gold-light/50 focus-within:ring-2 focus-within:ring-gold-light/30">
          <Search size={18} className="shrink-0 text-white/50" aria-hidden="true" />
          <span className="sr-only">
            {lang === 'km' ? 'ស្វែងរកទីក្រុង ឬប្រទេស' : 'Search for a city or country'}
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              lang === 'km' ? 'ភ្នំពេញ, បាងកក, ទីក្រុងតូក្យូ…' : 'Bangkok, Tokyo, Kuala Lumpur…'
            }
            className="min-w-0 flex-1 bg-transparent py-2 text-base text-white outline-none placeholder:text-white/40"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={lang === 'km' ? 'សម្អាតការស្វែងរក' : 'Clear search'}
              className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/55 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>

        <div className="sr-only" role="status" aria-live="polite">
          {searching
            ? lang === 'km'
              ? `រកឃើញ ${matching.length} ប្រទេស`
              : `${matching.length} countries match`
            : ''}
        </div>

        {grouped.length === 0 ? (
          <div className="night-card mt-8 p-8 text-center">
            <Globe2 size={22} className="mx-auto text-white/45" aria-hidden="true" />
            <h2 className="mt-3 font-display text-xl text-white">
              {lang === 'km' ? 'មិនមាននៅក្នុងបញ្ជីទេ' : 'Not in our coverage yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'យើងមិនទាន់មាន eSIM សម្រាប់ទីនោះទេ។ សូមពិនិត្យអក្ខរាវិរុទ្ធ ឬសាកល្បងឈ្មោះប្រទេស។'
                : 'We do not sell an eSIM for that yet. Check the spelling, or try the country name instead.'}
            </p>
          </div>
        ) : (
          <div className="mt-9 space-y-11">
            {grouped.map(({ region, countries }) => (
              <section key={region} aria-labelledby={`region-${region.replace(/\s+/g, '-')}`}>
                <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2.5">
                  <h2
                    id={`region-${region.replace(/\s+/g, '-')}`}
                    className="font-display text-2xl text-white"
                  >
                    {lang === 'km' ? (REGION_KM[region] ?? region) : region}
                  </h2>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-white/45">
                    {countries.length}
                  </span>
                </div>

                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {countries.map(({ country, cities }) => (
                    // `min-w-0`: a grid item defaults to min-width:auto, so it
                    // refuses to shrink below the intrinsic width of the
                    // nowrap city line — which defeated `truncate` and pushed
                    // the card 46px past a 390px viewport, taking the price
                    // off-screen and giving the page a horizontal scrollbar.
                    <li key={country.slug} className="min-w-0">
                      <Link
                        href={`/esim/${country.slug}`}
                        className="group flex min-h-[3.5rem] w-full items-start gap-3 rounded-card border border-white/8 bg-white/[0.03] p-3.5 transition-colors duration-200 ease-smooth hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                      >
                        <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
                          {country.flag}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <b className="text-sm font-semibold text-white">
                              {lang === 'km' ? country.nameKm : country.name}
                            </b>
                            {/* Said plainly: roaming is not a local plan. */}
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                country.hasDedicatedPlan
                                  ? 'bg-white/10 text-white/70'
                                  : 'bg-white/[0.06] text-white/50'
                              )}
                            >
                              {country.hasDedicatedPlan
                                ? lang === 'km'
                                  ? 'ផែនការផ្ទាល់'
                                  : 'Own plan'
                                : lang === 'km'
                                  ? 'រ៉ូមីង'
                                  : 'Roaming'}
                            </span>
                          </span>
                          {cities.length > 0 && (
                            <span className="mt-1 block truncate text-xs leading-relaxed text-white/50">
                              {cities
                                .slice(0, 4)
                                .map((city) => (lang === 'km' ? (city.nameKm ?? city.name) : city.name))
                                .join(' · ')}
                              {cities.length > 4 && ` · +${cities.length - 4}`}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-white/55 transition-colors group-hover:text-gold-light">
                          ${country.fromPriceUsd.toFixed(2)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-12 text-xs leading-relaxed text-white/45">
          {lang === 'km'
            ? 'តម្លៃចាប់ពី​ក្នុងមួយផែនការ។ "រ៉ូមីង" មានន័យថាភ្ជាប់តាមផែនការតំបន់ មិនមែនផែនការក្នុងស្រុកទេ។'
            : 'Prices are the cheapest plan that reaches each country. "Roaming" means a regional plan covers it rather than a local one.'}
        </p>
      </div>
    </div>
  );
}
