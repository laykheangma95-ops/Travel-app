import { describe, expect, it } from 'vitest';
import {
  bestCityMatch,
  cities,
  coveredCities,
  countrySlugsForCityQuery,
  searchCities,
} from '@/data/cities';
import { getServedCountry } from '@/data/coverage';
import { searchDestinations } from '@/content/destinations';

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

describe('destination search with cities', () => {
  it('answers a city search with the country plan that covers it', () => {
    const [top] = searchDestinations('Paris');
    expect(top.kind).toBe('esim-only');
    if (top.kind !== 'esim-only') return;
    expect(top.slug).toBe('france');
    expect(top.viaCity?.name).toBe('Paris');
  });

  it('sends Guangzhou to the China plan', () => {
    const hit = searchDestinations('Guangzhou').find(
      (h) => h.kind === 'esim-only' && h.slug === 'china'
    );
    expect(hit).toBeDefined();
  });

  it('still prefers a written guide over the city that duplicates it', () => {
    const hits = searchDestinations('Bangkok');
    expect(hits[0].kind).toBe('guide');
    // Thailand must appear once, as the guide — not again as a city row.
    const thailand = hits.filter(
      (h) => h.kind === 'esim-only' && h.slug === 'thailand'
    );
    expect(thailand).toHaveLength(0);
  });

  it('leaves a country search behaving exactly as before', () => {
    const hits = searchDestinations('Japan');
    expect(hits[0].kind).toBe('guide');
  });

  it('finds a country that only a bundle covers', () => {
    // Italy has no SKU of its own — it rides the Europe eSIM, and /esim/italy
    // has existed for a while. The search box has to be able to reach it.
    const hit = searchDestinations('Italy').find((h) => h.kind === 'esim-only' && h.slug === 'italy');
    expect(hit).toBeDefined();
  });

  it('puts a country name above a city that matched as well', () => {
    // "chi" must lead with China, not Chiang Mai.
    const hits = searchDestinations('chi');
    const china = hits.findIndex((h) => h.kind === 'esim-only' && h.slug === 'china');
    const thailand = hits.findIndex((h) => h.kind === 'esim-only' && h.slug === 'thailand');
    expect(china).toBeGreaterThanOrEqual(0);
    if (thailand >= 0) expect(china).toBeLessThan(thailand);
  });

  it('still finds nothing for a place nobody sells', () => {
    expect(searchDestinations('Atlantis')).toHaveLength(0);
  });
});
