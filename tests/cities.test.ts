import { describe, expect, it } from 'vitest';
import {
  bestCityMatch,
  cities,
  coveredCities,
  countrySlugsForCityQuery,
  searchCities,
} from '@/data/cities';
import { getServedCountry } from '@/data/coverage';
import { getDestination } from '@/data/destinations';
import { searchEsimProducts } from '@/data/esimSearch';

describe('city index', () => {
  it('never points at a country we cannot sell', () => {
    for (const { city, country } of coveredCities) {
      expect(getServedCountry(city.countrySlug), city.name).toBeDefined();
      expect(country.servedBy.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate city names', () => {
    const seen = new Set<string>();
    for (const city of cities) {
      const key = `${city.name.toLowerCase()}|${city.countrySlug}`;
      expect(seen.has(key), city.name).toBe(false);
      seen.add(key);
    }
  });

  it.each([
    ['Paris', 'france'],
    ['paris', 'france'],
    ['Guangzhou', 'china'],
    ['canton', 'china'],
    ['Osaka', 'japan'],
    ['Rome', 'italy'],
    ['Bali', 'indonesia'],
    ['Busan', 'south-korea'],
    ['CDG', 'france'],
    ['ក្វាងចូវ', 'china'],
  ])('resolves %s to %s', (query, slug) => {
    expect(bestCityMatch(query)?.country.slug).toBe(slug);
  });

  it('does not fan out on a two-character query', () => {
    // "an" must not drag in Antwerp, Ankara, Antalya and Nanning at once.
    for (const match of searchCities('an')) {
      const fields = [match.city.name, ...(match.city.aliases ?? [])];
      expect(fields.some((f) => f.toLowerCase().startsWith('an'))).toBe(true);
    }
  });

  it('gives the store a country slug set to filter on', () => {
    expect(countrySlugsForCityQuery('Shenzhen').has('china')).toBe(true);
    expect(countrySlugsForCityQuery('Nowhereville').size).toBe(0);
  });
});

describe('homepage product search', () => {
  it('answers a city search with the plan that covers it', () => {
    const [top] = searchEsimProducts('Paris');
    expect(top.slug).toBe('france');
    expect(top.viaCity?.name).toBe('Paris');
  });

  it('sends Guangzhou to the China plan', () => {
    expect(searchEsimProducts('Guangzhou')[0].slug).toBe('china');
  });

  it('answers a country search with that country, never a guide', () => {
    // The two the owner named: both must come back as a plan, priced.
    for (const [query, slug] of [
      ['china', 'china'],
      ['switzerland', 'switzerland'],
    ]) {
      const [top] = searchEsimProducts(query);
      expect(top.slug, query).toBe(slug);
      expect(top.fromPriceUsd, query).toBeGreaterThan(0);
    }
  });

  it('answers a written-up city with its country plan too', () => {
    // Bangkok has a guide. The search bar still sells: Thailand, one row.
    const hits = searchEsimProducts('Bangkok');
    expect(hits[0].slug).toBe('thailand');
    expect(hits.filter((h) => h.slug === 'thailand')).toHaveLength(1);
  });

  it('prices every row', () => {
    for (const hit of searchEsimProducts('s')) {
      expect(Number.isFinite(hit.fromPriceUsd), hit.slug).toBe(true);
      expect(hit.fromPriceUsd, hit.slug).toBeGreaterThan(0);
    }
  });

  it('finds a country that only a bundle covers', () => {
    // Italy has no SKU of its own — it rides the Europe eSIM, and /esim/italy
    // has existed for a while. The search box has to be able to reach it.
    expect(searchEsimProducts('Italy')[0].slug).toBe('italy');
  });

  it('puts a country name above a city that matched as well', () => {
    // "chi" must lead with China, not Chiang Mai.
    const hits = searchEsimProducts('chi');
    const china = hits.findIndex((h) => h.slug === 'china');
    const thailand = hits.findIndex((h) => h.slug === 'thailand');
    expect(china).toBeGreaterThanOrEqual(0);
    if (thailand >= 0) expect(china).toBeLessThan(thailand);
  });

  it('never offers a slug with no page behind it', () => {
    for (const query of ['paris', 'rome', 'tokyo', 'europe', 'switzerland', 'bali']) {
      for (const hit of searchEsimProducts(query)) {
        const real = getDestination(hit.slug) ?? getServedCountry(hit.slug);
        expect(real, `${query} → ${hit.slug}`).toBeDefined();
      }
    }
  });

  it('still finds nothing for a place nobody sells', () => {
    expect(searchEsimProducts('Atlantis')).toHaveLength(0);
  });
});
