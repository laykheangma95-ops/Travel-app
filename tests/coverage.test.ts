import { describe, expect, it } from 'vitest';
import {
  carriersInCountry,
  coverageCount,
  coverageFor,
  coverageStats,
  destinationsServing,
  getServedCountry,
  globalReachPlans,
  regionalBundles,
  servedCountries,
  topDestinations,
  wideCoverageCountryPlans,
} from '@/data/coverage';
import { destinations } from '@/data/destinations';
import { destinationNetworks } from '@/data/gohubNetworks';

describe('coverage index', () => {
  it('serves far more countries than we have destination SKUs', () => {
    expect(servedCountries.length).toBeGreaterThan(destinations.length);
  });

  it('expands the France SKU to its full roaming footprint', () => {
    // The whole reason this module exists: GoHub file a 32-country roaming SKU
    // under France. If this drops back to 1, the store is underselling again.
    expect(coverageCount('france')).toBe(32);
  });

  it('sells Italy, Portugal and Norway even though they have no SKU', () => {
    for (const slug of ['italy', 'portugal', 'norway']) {
      const country = getServedCountry(slug);
      expect(country, slug).toBeDefined();
      expect(country!.hasDedicatedPlan).toBe(false);
      expect(destinationsServing(slug).length).toBeGreaterThan(0);
    }
  });

  it('keeps every existing destination slug resolvable', () => {
    // Rule 13: the public site must not break. Every URL that worked before
    // still has to work.
    for (const dest of destinations) {
      expect(coverageCount(dest.slug), dest.slug).toBeGreaterThan(0);
    }
  });

  it('gives every served country a price and at least one plan', () => {
    for (const country of servedCountries) {
      expect(country.servedBy.length, country.name).toBeGreaterThan(0);
      expect(Number.isFinite(country.fromPriceUsd), country.name).toBe(true);
    }
  });

  it('lists the cheapest route into a country first', () => {
    for (const country of servedCountries) {
      const prices = destinationsServing(country.slug).map((d) => d.fromPriceUsd);
      expect([...prices].sort((a, b) => a - b), country.name).toEqual(prices);
    }
  });

  it('does not lose a supplier coverage country to a spelling gap', () => {
    // An unmapped country name is silently dropped by design, so assert the
    // registry covers everything the price list actually names.
    const named = new Set<string>();
    for (const network of Object.values(destinationNetworks)) {
      for (const entry of network.coverage) named.add(entry.country);
    }
    const mapped = new Set(servedCountries.map((c) => c.name));
    const missing = [...named].filter(
      (name) => !mapped.has(name) && !mapped.has(name === 'United States' ? 'USA' : name)
    );
    expect(missing).toEqual([]);
  });

  it('reports the carrier for the country asked about, not the SKU name', () => {
    // The Europe eSIM is Free Mobile in France and 3 in Italy.
    expect(carriersInCountry('europe', 'italy')).toContain('3 (4G Only)');
    expect(carriersInCountry('europe', 'france')).toContain('Free Mobile');
  });

  it('separates true bundles from country SKUs that happen to roam', () => {
    for (const dest of regionalBundles) expect(getServedCountry(dest.slug)).toBeUndefined();
    for (const dest of wideCoverageCountryPlans) {
      expect(getServedCountry(dest.slug)?.slug).toBe(dest.slug);
      expect(coverageCount(dest.slug)).toBeGreaterThan(1);
    }
  });

  it('only calls a plan global if it crosses three or more countries', () => {
    for (const dest of globalReachPlans) expect(coverageCount(dest.slug)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the store headline in step with the data', () => {
    expect(coverageStats.countries).toBe(servedCountries.length);
    expect(coverageStats.destinations).toBe(destinations.length);
    expect(topDestinations.every((d) => d.popular)).toBe(true);
    expect(coverageFor('europe').length).toBe(coverageCount('europe'));
  });
});
