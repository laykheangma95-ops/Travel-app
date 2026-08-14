// ─────────────────────────────────────────────────────────────────────────────
// Product search — the homepage search bar.
//
// The search bar sells eSIMs. Every row it returns is something we can put on a
// phone, and pressing one goes to that plan. It does not answer with guides,
// and it never tells someone their destination has no write-up yet: that was an
// editorial answer to a shopping question.
//
// Three things resolve to the same product:
//
//   • a plan name          — "Europe", "Southeast Asia"
//   • a country we cover   — "China", "Switzerland", including the ones with no
//                            SKU of their own, which ride a bundle
//   • a city               — "Guangzhou" → China, "Paris" → France
//
// Nothing here decides coverage. data/coverage.ts already knows which SKU
// reaches which country, and data/cities.ts knows which country a city is in.
// This file only ranks them against what someone typed.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations } from './destinations';
import { servedCountries } from './coverage';
import { searchCities } from './cities';

export interface EsimProductHit {
  /** URL segment for /esim/[slug] — a plan, or a country a plan reaches. */
  slug: string;
  name: string;
  nameKm: string;
  /** Cheapest plan that reaches it, in USD. */
  fromPriceUsd: number;
  /** Set when the match came through a city: "Guangzhou" answered with China. */
  viaCity?: { name: string; nameKm?: string };
  score: number;
}

interface Sellable {
  slug: string;
  name: string;
  nameKm: string;
  fromPriceUsd: number;
}

/**
 * Everything the search can sell: the SKUs (which include the regional bundles)
 * plus every country those SKUs reach without having a plan of their own —
 * Italy, Portugal and Switzerland all ride the Europe footprint and all have a
 * real /esim page.
 */
const sellable: Sellable[] = [
  ...destinations.map((d) => ({
    slug: d.slug,
    name: d.name,
    nameKm: d.nameKm,
    fromPriceUsd: d.fromPriceUsd,
  })),
  ...servedCountries
    .filter((c) => !destinations.some((d) => d.slug === c.slug))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      nameKm: c.nameKm,
      fromPriceUsd: c.fromPriceUsd,
    })),
];

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFC').trim();
}

/** City match strength, expressed on the same scale as a product name. */
const CITY_TIER: Record<100 | 80 | 45, number> = { 100: 70, 80: 55, 45: 25 };

/**
 * Rank the catalogue against what someone typed.
 *
 * Exact name 70, prefix 55, contained 25. A city scores one point under a
 * product name that matched as well, so "chi" leads with China rather than
 * Chiang Mai, and the city's weight (0–10, scaled down) only orders cities
 * among themselves. One row per product: if the name and a city in it both
 * match, the name wins and the city is not repeated.
 */
export function searchEsimProducts(query: string, limit = 6): EsimProductHit[] {
  const q = normalise(query);
  if (!q) return [];

  const hits: EsimProductHit[] = [];
  const claimed = new Set<string>();

  for (const product of sellable) {
    const fields = [product.name, product.nameKm, product.slug];
    let best = 0;
    for (const field of fields) {
      const f = normalise(field);
      if (f === q) best = Math.max(best, 70);
      else if (f.startsWith(q)) best = Math.max(best, 55);
      else if (f.includes(q)) best = Math.max(best, 25);
    }
    if (best > 0) {
      hits.push({ ...product, score: best });
      claimed.add(product.slug);
    }
  }

  for (const match of searchCities(query, limit)) {
    if (claimed.has(match.country.slug)) continue;
    claimed.add(match.country.slug);
    hits.push({
      slug: match.country.slug,
      name: match.country.name,
      nameKm: match.country.nameKm,
      fromPriceUsd: match.country.fromPriceUsd,
      viaCity: { name: match.city.name, nameKm: match.city.nameKm },
      score: CITY_TIER[match.tier] - 1 + (match.city.weight ?? 0) / 10,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
