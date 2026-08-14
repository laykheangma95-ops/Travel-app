import type { DestinationGuide } from '../schema';
import { destinations as esimCountries } from '@/data/destinations';
import { searchCities } from '@/data/cities';
import { servedCountries } from '@/data/coverage';
import { bangkok } from './bangkok';
import { daNang } from './da-nang';
import { hoChiMinhCity } from './ho-chi-minh-city';
import { kualaLumpur } from './kuala-lumpur';
import { seoul } from './seoul';
import { singapore } from './singapore';
import { tokyo } from './tokyo';

/**
 * Seven destinations, written properly. Adding an eighth means adding a file
 * and one line here — no component changes.
 *
 * We deliberately do not auto-generate thin guides for the rest of the eSIM
 * catalogue. A search for somewhere we have not written up degrades honestly
 * (see `searchDestinations` below): we say the guide is not written yet and
 * offer the eSIM if we sell it.
 */
export const guides: DestinationGuide[] = [
  bangkok,
  hoChiMinhCity,
  singapore,
  seoul,
  tokyo,
  kualaLumpur,
  daNang,
];

export const guideSlugs = guides.map((g) => g.slug);

export function getGuide(slug: string): DestinationGuide | undefined {
  return guides.find((g) => g.slug === slug);
}

/**
 * A search hit is either a written guide, or a country we only sell an eSIM for.
 *
 * `viaCity` is set when the match came from a city rather than the country
 * itself — "Paris" resolving to the France coverage, "Guangzhou" to China. The
 * row then shows the city the traveller typed, with the country underneath, so
 * they can see the join we made rather than wondering why they asked for Paris
 * and were handed France.
 */
export type SearchHit =
  | { kind: 'guide'; guide: DestinationGuide; score: number }
  | {
      kind: 'esim-only';
      slug: string;
      name: string;
      nameKm: string;
      score: number;
      viaCity?: { name: string; nameKm?: string };
    };

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFC').trim();
}

/** City match strength, expressed on the country scale (exact/prefix/contains). */
const CITY_TIER_AS_COUNTRY: Record<100 | 80 | 45, number> = { 100: 70, 80: 55, 45: 25 };

/**
 * Ranking, in order of how well the match tells us what the person meant:
 *   1. the city or country name starts with what they typed
 *   2. any alias starts with it (airport codes, Khmer spellings, nicknames)
 *   3. it appears anywhere in an alias
 * `routeWeight` then breaks ties toward the routes Cambodians actually fly, so
 * "s" surfaces Singapore before Seoul without either being hidden.
 */
export function searchDestinations(query: string, limit = 6): SearchHit[] {
  const q = normalise(query);
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const guide of guides) {
    const fields = [guide.city.en, guide.city.km, guide.country.en, guide.country.km, ...guide.aliases];
    let best = 0;
    for (const field of fields) {
      const f = normalise(field);
      if (f === q) best = Math.max(best, 100);
      else if (f.startsWith(q)) best = Math.max(best, 80);
      else if (f.includes(q)) best = Math.max(best, 45);
    }
    if (best > 0) hits.push({ kind: 'guide', guide, score: best + guide.routeWeight });
  }

  // Everywhere we can put data on a phone: the SKUs (which include the
  // regional bundles — "Europe", "Southeast Asia") plus every country those
  // SKUs reach without having a plan of their own. Italy and Portugal are on
  // the Europe eSIM and have had a /esim page for a while; before this they
  // were unreachable from the search box that is meant to find them.
  const searchable = [
    ...esimCountries.map((d) => ({ slug: d.slug, name: d.name, nameKm: d.nameKm })),
    ...servedCountries
      .filter((c) => !esimCountries.some((d) => d.slug === c.slug))
      .map((c) => ({ slug: c.slug, name: c.name, nameKm: c.nameKm })),
  ];

  const covered = new Set(guides.map((g) => g.esimCountrySlug));
  for (const c of searchable) {
    if (covered.has(c.slug)) continue;
    const fields = [c.name, c.nameKm, c.slug];
    let best = 0;
    for (const field of fields) {
      const f = normalise(field);
      if (f === q) best = Math.max(best, 70);
      else if (f.startsWith(q)) best = Math.max(best, 55);
      else if (f.includes(q)) best = Math.max(best, 25);
    }
    if (best > 0) {
      hits.push({ kind: 'esim-only', slug: c.slug, name: c.name, nameKm: c.nameKm, score: best });
    }
  }

  // Cities. Nobody says "I'm going to France" — they say Paris, and they say
  // Guangzhou rather than China. Each city resolves to the country whose
  // coverage serves it, so the answer is the plan that actually works there.
  // A city is skipped when the country is already on the list, so searching
  // "Bangkok" gives the Bangkok guide once, not a guide and a Thailand row.
  const claimed = new Set(
    hits.map((h) => (h.kind === 'guide' ? h.guide.esimCountrySlug : h.slug))
  );
  for (const match of searchCities(query, limit)) {
    if (claimed.has(match.country.slug)) continue;
    claimed.add(match.country.slug);
    hits.push({
      kind: 'esim-only',
      slug: match.country.slug,
      name: match.country.name,
      nameKm: match.country.nameKm,
      // Scored on the country scale, one point under it: a country typed by
      // name still outranks a city that matched equally well, so "chi" leads
      // with China rather than Chiang Mai. The city's weight (0–10, scaled
      // down) only orders cities among themselves.
      score: CITY_TIER_AS_COUNTRY[match.tier] - 1 + (match.city.weight ?? 0) / 10,
      viaCity: { name: match.city.name, nameKm: match.city.nameKm },
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * What the globe shows before anyone types. These are not decoration — each one
 * is pressable, and pressing it flies you there. Exploration before search.
 */
export const idlePins = guides
  .slice()
  .sort((a, b) => b.routeWeight - a.routeWeight)
  .map((g) => ({ slug: g.slug, lat: g.geo.lat, lon: g.geo.lon, label: g.city.en }));
