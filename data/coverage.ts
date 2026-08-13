// ─────────────────────────────────────────────────────────────────────────────
// The coverage index.
//
// The problem this solves: our supplier catalogue is organised by SKU, not by
// where a customer is going. The "France" eSIM is not a France eSIM — it is a
// 32-country roaming SKU that GoHub happen to file under France. Until this
// file existed, a traveller searching "Italy" or "Portugal" got nothing, even
// though we can sell them data there today.
//
// So: every destination is expanded into the countries it actually covers, and
// the index is inverted so any country can find the destinations that serve it.
// Nothing here invents coverage — it is derived from data/gohubNetworks.ts,
// which is generated from GoHub's price list. The only hand-written parts are
// the ISO/name/Khmer registry and BUNDLE_MEMBERS, both marked below.
// ─────────────────────────────────────────────────────────────────────────────

import type { Destination } from '@/types';
import { destinations, getDestination } from './destinations';
import { destinationNetworks } from './gohubNetworks';
import { esimPlans } from './esimPlans';

export type CoverageRegion = Destination['region'];

export interface ServedCountry {
  /** ISO 3166-1 alpha-2. The canonical key — coverage lists spell the same
   *  country several ways ('United States' vs our 'USA' destination). */
  iso2: string;
  /** URL segment. Matches the destination slug where one exists, so
   *  /esim/france and /esim/japan keep working exactly as before. */
  slug: string;
  name: string;
  nameKm: string;
  flag: string;
  region: CoverageRegion;
  /** Destination slugs that can put data on a phone in this country,
   *  cheapest first. */
  servedBy: string[];
  /** Cheapest plan across every destination that covers this country. */
  fromPriceUsd: number;
  /** True when we sell a SKU dedicated to this country, rather than only
   *  reaching it through a regional bundle. */
  hasDedicatedPlan: boolean;
}

// ── Hand-written registry ────────────────────────────────────────────────────
// Every country name that appears in a coverage list or is a member of a
// bundle, mapped to ISO code, slug, Khmer name and region. Khmer names are the
// customer-facing string on a Khmer-primary site, so they are spelled out
// rather than transliterated at runtime.
//
// `slug` deliberately reuses the existing destination slug where one exists.
// A country with no dedicated SKU gets its own slug so it is still linkable.
interface CountryRecord {
  iso2: string;
  slug: string;
  nameKm: string;
  region: CoverageRegion;
  /** Other spellings of this country found in supplier coverage lists. */
  aliases?: string[];
}

const COUNTRY_REGISTRY: Record<string, CountryRecord> = {
  // ── Southeast Asia ──
  'Cambodia': { iso2: 'KH', slug: 'cambodia', nameKm: 'កម្ពុជា', region: 'Southeast Asia' },
  'Thailand': { iso2: 'TH', slug: 'thailand', nameKm: 'ថៃ', region: 'Southeast Asia' },
  'Vietnam': { iso2: 'VN', slug: 'vietnam', nameKm: 'វៀតណាម', region: 'Southeast Asia' },
  'Laos': { iso2: 'LA', slug: 'laos', nameKm: 'ឡាវ', region: 'Southeast Asia' },
  'Malaysia': { iso2: 'MY', slug: 'malaysia', nameKm: 'ម៉ាឡេស៊ី', region: 'Southeast Asia' },
  'Singapore': { iso2: 'SG', slug: 'singapore', nameKm: 'សិង្ហបូរី', region: 'Southeast Asia' },
  'Indonesia': { iso2: 'ID', slug: 'indonesia', nameKm: 'ឥណ្ឌូនេស៊ី', region: 'Southeast Asia' },
  'Philippines': { iso2: 'PH', slug: 'philippines', nameKm: 'ហ្វីលីពីន', region: 'Southeast Asia' },

  // ── East Asia ──
  'China': { iso2: 'CN', slug: 'china', nameKm: 'ចិន', region: 'East Asia' },
  'Japan': { iso2: 'JP', slug: 'japan', nameKm: 'ជប៉ុន', region: 'East Asia' },
  'South Korea': { iso2: 'KR', slug: 'south-korea', nameKm: 'កូរ៉េខាងត្បូង', region: 'East Asia' },
  'Taiwan': { iso2: 'TW', slug: 'taiwan', nameKm: 'តៃវ៉ាន់', region: 'East Asia' },
  'Hong Kong': { iso2: 'HK', slug: 'hong-kong', nameKm: 'ហុងកុង', region: 'East Asia' },
  'Macao': { iso2: 'MO', slug: 'macao', nameKm: 'ម៉ាកាវ', region: 'East Asia', aliases: ['Macau'] },

  // ── Asia ──
  'India': { iso2: 'IN', slug: 'india', nameKm: 'ឥណ្ឌា', region: 'Asia' },

  // ── Middle East ──
  'UAE': { iso2: 'AE', slug: 'uae', nameKm: 'អេមីរ៉ាតអារ៉ាប់រួម', region: 'Middle East', aliases: ['United Arab Emirates'] },
  'Turkey': { iso2: 'TR', slug: 'turkey', nameKm: 'ទួរគី', region: 'Middle East', aliases: ['Türkiye'] },

  // ── Oceania ──
  'Australia': { iso2: 'AU', slug: 'australia', nameKm: 'អូស្ត្រាលី', region: 'Oceania' },
  'New Zealand': { iso2: 'NZ', slug: 'new-zealand', nameKm: 'នូវែលសេឡង់', region: 'Oceania' },

  // ── Americas ──
  'USA': { iso2: 'US', slug: 'usa', nameKm: 'អាមេរិក', region: 'Americas', aliases: ['United States', 'United States of America'] },
  'Canada': { iso2: 'CA', slug: 'canada', nameKm: 'កាណាដា', region: 'Americas' },
  'Mexico': { iso2: 'MX', slug: 'mexico', nameKm: 'ម៉ិកស៊ិក', region: 'Americas' },

  // ── Europe ──
  'France': { iso2: 'FR', slug: 'france', nameKm: 'បារាំង', region: 'Europe' },
  'United Kingdom': { iso2: 'GB', slug: 'united-kingdom', nameKm: 'ចក្រភពអង់គ្លេស', region: 'Europe', aliases: ['UK', 'Great Britain'] },
  'Germany': { iso2: 'DE', slug: 'germany', nameKm: 'អាល្លឺម៉ង់', region: 'Europe' },
  'Netherlands': { iso2: 'NL', slug: 'netherlands', nameKm: 'ហូឡង់', region: 'Europe' },
  'Switzerland': { iso2: 'CH', slug: 'switzerland', nameKm: 'ស្វីស', region: 'Europe' },
  'Spain': { iso2: 'ES', slug: 'spain', nameKm: 'អេស្ប៉ាញ', region: 'Europe' },
  'Poland': { iso2: 'PL', slug: 'poland', nameKm: 'ប៉ូឡូញ', region: 'Europe' },
  'Italy': { iso2: 'IT', slug: 'italy', nameKm: 'អ៊ីតាលី', region: 'Europe' },
  'Austria': { iso2: 'AT', slug: 'austria', nameKm: 'អូទ្រីស', region: 'Europe' },
  'Denmark': { iso2: 'DK', slug: 'denmark', nameKm: 'ដាណឺម៉ាក', region: 'Europe' },
  'Belgium': { iso2: 'BE', slug: 'belgium', nameKm: 'បែលហ្ស៊ិក', region: 'Europe' },
  'Bulgaria': { iso2: 'BG', slug: 'bulgaria', nameKm: 'ប៊ុលហ្គារី', region: 'Europe' },
  'Cyprus': { iso2: 'CY', slug: 'cyprus', nameKm: 'ស៊ីប', region: 'Europe' },
  'Czech Republic': { iso2: 'CZ', slug: 'czech-republic', nameKm: 'ឆេក', region: 'Europe', aliases: ['Czechia'] },
  'Estonia': { iso2: 'EE', slug: 'estonia', nameKm: 'អេស្តូនី', region: 'Europe' },
  'Finland': { iso2: 'FI', slug: 'finland', nameKm: 'ហ្វាំងឡង់', region: 'Europe' },
  'Hungary': { iso2: 'HU', slug: 'hungary', nameKm: 'ហុងគ្រី', region: 'Europe' },
  'Ireland': { iso2: 'IE', slug: 'ireland', nameKm: 'អៀរឡង់', region: 'Europe' },
  'Lithuania': { iso2: 'LT', slug: 'lithuania', nameKm: 'លីទុយអានី', region: 'Europe' },
  'Luxembourg': { iso2: 'LU', slug: 'luxembourg', nameKm: 'លុចសំបួរ', region: 'Europe' },
  'Malta': { iso2: 'MT', slug: 'malta', nameKm: 'ម៉ាល់ត៍', region: 'Europe' },
  'Portugal': { iso2: 'PT', slug: 'portugal', nameKm: 'ព័រទុយហ្គាល់', region: 'Europe' },
  'Romania': { iso2: 'RO', slug: 'romania', nameKm: 'រូម៉ានី', region: 'Europe' },
  'Russia': { iso2: 'RU', slug: 'russia', nameKm: 'រុស្ស៊ី', region: 'Europe' },
  'Slovakia': { iso2: 'SK', slug: 'slovakia', nameKm: 'ស្លូវ៉ាគី', region: 'Europe' },
  'Sweden': { iso2: 'SE', slug: 'sweden', nameKm: 'ស៊ុយអែត', region: 'Europe' },
  'Liechtenstein': { iso2: 'LI', slug: 'liechtenstein', nameKm: 'លិចតេនស្តាញ', region: 'Europe' },
  'Moldova': { iso2: 'MD', slug: 'moldova', nameKm: 'ម៉ុលដាវី', region: 'Europe' },
  'Norway': { iso2: 'NO', slug: 'norway', nameKm: 'ន័រវេស', region: 'Europe' },
  'Vatican City': { iso2: 'VA', slug: 'vatican-city', nameKm: 'វ៉ាទីកង់', region: 'Europe', aliases: ['Holy See'] },
};

// ── Hand-written: bundles whose coverage list is empty ───────────────────────
// GoHub's price list gives a per-country carrier breakdown for most multi-country
// SKUs, but leaves it blank on a few where the destination name already says who
// is covered. Those are spelled out here rather than guessed at elsewhere.
// A destination not listed here and with an empty coverage[] is a single-country
// SKU, and covers itself.
const BUNDLE_MEMBERS: Record<string, string[]> = {
  'hong-kong-macao': ['Hong Kong', 'Macao'],
  'usa-mexico-canada': ['USA', 'Mexico', 'Canada'],
};

// ── Derivation ───────────────────────────────────────────────────────────────

/** Name (or supplier alias) → canonical registry key. */
const NAME_TO_KEY = new Map<string, string>();
for (const [key, record] of Object.entries(COUNTRY_REGISTRY)) {
  NAME_TO_KEY.set(key.toLowerCase(), key);
  for (const alias of record.aliases ?? []) NAME_TO_KEY.set(alias.toLowerCase(), key);
}

/** Destination slug → registry key, for single-country SKUs. */
const SLUG_TO_KEY = new Map<string, string>();
for (const [key, record] of Object.entries(COUNTRY_REGISTRY)) {
  SLUG_TO_KEY.set(record.slug, key);
}

function resolveKey(name: string): string | undefined {
  return NAME_TO_KEY.get(name.trim().toLowerCase());
}

/**
 * The countries a destination actually covers, as registry keys.
 *
 * Three cases, in order: an explicit supplier coverage breakdown; a bundle we
 * spelled out above; or a single-country SKU that covers itself.
 */
function coverageKeysFor(slug: string): string[] {
  const network = destinationNetworks[slug];
  const keys: string[] = [];

  if (network && network.coverage.length > 0) {
    for (const entry of network.coverage) {
      const key = resolveKey(entry.country);
      // An unmapped supplier country is dropped rather than shown half-formed.
      // Add it to COUNTRY_REGISTRY when GoHub introduce one.
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  const members = BUNDLE_MEMBERS[slug];
  if (members) {
    for (const name of members) {
      const key = resolveKey(name);
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  const own = SLUG_TO_KEY.get(slug);
  return own ? [own] : [];
}

/** Cheapest plan we sell for a destination, or Infinity if it has none. */
function fromPriceFor(slug: string): number {
  const prices = esimPlans.filter((p) => p.countrySlug === slug).map((p) => p.priceUsd);
  return prices.length > 0 ? Math.min(...prices) : Infinity;
}

/** Regional-indicator flag from an ISO 3166-1 alpha-2 code. */
function flagFromIso(iso2: string): string {
  return String.fromCodePoint(
    ...iso2.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

/** slug → the countries that destination covers. */
export const destinationCoverage: Record<string, string[]> = Object.fromEntries(
  destinations.map((d) => [d.slug, coverageKeysFor(d.slug)])
);

/** How many countries a destination covers. 1 for a single-country SKU. */
export function coverageCount(slug: string): number {
  return destinationCoverage[slug]?.length ?? 0;
}

/** The covered countries of a destination, as full records for rendering. */
export function coverageFor(slug: string): ServedCountry[] {
  return (destinationCoverage[slug] ?? [])
    .map((key) => servedCountryByKey.get(key))
    .filter((c): c is ServedCountry => Boolean(c));
}

// Build the inverted index: country → destinations that reach it.
const byKey = new Map<string, ServedCountry>();

for (const destination of destinations) {
  for (const key of destinationCoverage[destination.slug] ?? []) {
    const record = COUNTRY_REGISTRY[key];
    if (!record) continue;

    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        iso2: record.iso2,
        slug: record.slug,
        name: key,
        nameKm: record.nameKm,
        flag: flagFromIso(record.iso2),
        region: record.region,
        servedBy: [],
        fromPriceUsd: Infinity,
        hasDedicatedPlan: false,
      };
      byKey.set(key, entry);
    }

    const price = fromPriceFor(destination.slug);
    if (price === Infinity) continue; // a destination with no sellable plan serves nobody

    entry.servedBy.push(destination.slug);
    entry.fromPriceUsd = Math.min(entry.fromPriceUsd, price);
    // A dedicated SKU is one whose slug IS this country — /esim/japan for Japan.
    if (destination.slug === record.slug) entry.hasDedicatedPlan = true;
  }
}

// Cheapest route into each country first, so the country card and the country
// page both lead with the plan a customer would actually pick.
for (const entry of byKey.values()) {
  entry.servedBy.sort((a, b) => {
    const priceDelta = fromPriceFor(a) - fromPriceFor(b);
    if (priceDelta !== 0) return priceDelta;
    // Tie-break toward the narrower plan: a Japan SKU beats an Asia bundle.
    return coverageCount(a) - coverageCount(b);
  });
}

const servedCountryByKey = byKey;

/**
 * Every country we can put data on a phone in — not every country with its own
 * SKU. This is the list the store's Countries tab renders, and it is roughly
 * twice the destination count because of the regional bundles.
 */
export const servedCountries: ServedCountry[] = [...byKey.values()]
  .filter((c) => c.servedBy.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name));

const servedBySlug = new Map(servedCountries.map((c) => [c.slug, c]));

/** Look a country up by its URL segment. */
export function getServedCountry(slug: string): ServedCountry | undefined {
  return servedBySlug.get(slug);
}

/** True when this slug is a country we serve but have no dedicated SKU for —
 *  Italy, Portugal, Norway and the rest of the Europe bundle. */
export function isCoverageOnlyCountry(slug: string): boolean {
  const country = servedBySlug.get(slug);
  return Boolean(country && !country.hasDedicatedPlan);
}

/**
 * Destinations that are a bundle rather than a country — the Regions tab.
 * Sorted widest coverage first, because breadth is the reason to buy one.
 */
export const regionalBundles: Destination[] = destinations
  .filter((d) => coverageCount(d.slug) > 1 && !SLUG_TO_KEY.has(d.slug))
  .sort((a, b) => coverageCount(b.slug) - coverageCount(a.slug));

/**
 * Single-country destinations that nonetheless roam across a region — the
 * France SKU is the whole reason this file exists. GoHub file it under one
 * country; it works in 32. Surfacing these stops us underselling them.
 */
export const wideCoverageCountryPlans: Destination[] = destinations
  .filter((d) => SLUG_TO_KEY.has(d.slug) && coverageCount(d.slug) > 1)
  .sort((a, b) => coverageCount(b.slug) - coverageCount(a.slug));

/**
 * The closest thing we have to a global plan.
 *
 * There is no worldwide SKU in the GoHub price list — see docs/COVERAGE.md.
 * Rather than invent one, the Global tab shows every plan that crosses a
 * continent, which today means the Europe/France/UK/Germany SKUs (Europe plus
 * the United States, Turkey and Russia) and USA·Mexico·Canada.
 */
export const GLOBAL_COVERAGE_THRESHOLD = 3;

export const globalReachPlans: Destination[] = destinations
  .filter((d) => coverageCount(d.slug) >= GLOBAL_COVERAGE_THRESHOLD)
  .sort((a, b) => coverageCount(b.slug) - coverageCount(a.slug));

/** Top destinations — the ones customers actually buy. */
export const topDestinations: Destination[] = destinations.filter((d) => d.popular);

/** Headline numbers for the store. Derived, so they cannot drift from the data. */
export const coverageStats = {
  countries: servedCountries.length,
  destinations: destinations.length,
  regions: regionalBundles.length,
  widestPlan: globalReachPlans[0]
    ? { slug: globalReachPlans[0].slug, countries: coverageCount(globalReachPlans[0].slug) }
    : null,
};

/**
 * The carriers a given plan uses in one specific country.
 *
 * Matters because a bundle's carrier list is not uniform: the Europe eSIM runs
 * on Free Mobile in France and on 3 in Italy. Telling an Italy customer they
 * are on Free Mobile is a support ticket waiting to happen.
 */
export function carriersInCountry(destinationSlug: string, countrySlug: string): string[] {
  const country = servedBySlug.get(countrySlug);
  const network = destinationNetworks[destinationSlug];
  if (!country || !network) return [];

  const carriers = new Set<string>();
  for (const entry of network.coverage) {
    if (resolveKey(entry.country) === country.name) {
      for (const carrier of entry.carriers) carriers.add(carrier);
    }
  }
  return [...carriers];
}

/** The destination a country page should sell, cheapest first. */
export function destinationsServing(countrySlug: string): Destination[] {
  const country = servedBySlug.get(countrySlug);
  if (!country) return [];
  return country.servedBy
    .map((slug) => getDestination(slug))
    .filter((d): d is Destination => Boolean(d));
}
