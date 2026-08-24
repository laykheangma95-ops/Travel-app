// ─────────────────────────────────────────────────────────────────────────────
// The trip planner's destination vocabulary.
//
// WHY IT IS SEPARATE FROM COVERAGE:
//   data/cities.ts resolves everything above `tripDestinations` through
//   data/coverage.ts, which drops any city whose country we cannot sell an eSIM
//   for. That is right for the store and wrong for the planner: it made the
//   trip planner smaller than the data the repo already holds, so someone
//   planning Athens could not name Athens.
//
// THE INVARIANT THAT MATTERS MOST:
//   Whatever a traveler picks, `country` must be a name the rest of the system
//   can match. trip_plans.destination is keyed on by destination_places, by
//   resolveTrip in lib/travel/savedPlaces.ts, and by matchDestination in
//   lib/travel/context.ts. Storing "Kuala Lumpur" would leave the trip
//   unreachable by all three — the itinerary would find no places, saving a
//   place would open a second trip, and the card would lose its flag.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { countries } from '@/data/countries';
import { countryNameForCitySlug, tripDestinations } from '@/data/cities';
import { servedCountries } from '@/data/coverage';

const countryNames = new Set(countries.map((country) => country.name));

describe('tripDestinations', () => {
  it('offers every country in the world, not just the ones we sell', () => {
    const offered = tripDestinations.filter((item) => item.kind === 'country');
    expect(offered).toHaveLength(countries.length);
    // The whole point: far more than the eSIM catalogue.
    expect(offered.length).toBeGreaterThan(servedCountries.length);
  });

  it('offers cities as well, so nobody has to think in country names', () => {
    const cities = tripDestinations.filter((item) => item.kind === 'city');
    expect(cities.length).toBeGreaterThan(200);
    for (const name of ['Kuala Lumpur', 'Ho Chi Minh City', 'Bangkok', 'Tokyo']) {
      expect(cities.some((city) => city.label === name), name).toBe(true);
    }
  });

  it('resolves EVERY entry to a country the rest of the system can match', () => {
    // The invariant in the header. A single unmatched name here would be a trip
    // that silently has no places, no flag, and a duplicate on the next save.
    const unmatched = tripDestinations.filter((item) => !countryNames.has(item.country));
    expect(unmatched.map((item) => `${item.label} -> ${item.country}`)).toEqual([]);
  });

  it('includes cities whose country has no eSIM at all', () => {
    // Greece and Latvia are the two the city index already knew about and the
    // coverage-gated list threw away. They are the reason this list exists.
    const served = new Set(servedCountries.map((country) => country.name));
    expect(served.has('Greece')).toBe(false);

    const greek = tripDestinations.filter((item) => item.country === 'Greece');
    expect(greek.map((item) => item.label)).toContain('Athens');
  });

  it('maps the four city-index slugs that spell their country differently', () => {
    // Verified against data/countries.ts rather than assumed — the registry
    // says macao/uae/usa/czech-republic, the country list disagrees on all four.
    expect(countryNameForCitySlug('macao')).toBe('Macau');
    expect(countryNameForCitySlug('uae')).toBe('United Arab Emirates');
    expect(countryNameForCitySlug('usa')).toBe('United States');
    expect(countryNameForCitySlug('czech-republic')).toBe('Czechia');
  });

  it('returns nothing for a country slug it cannot name, rather than guessing', () => {
    expect(countryNameForCitySlug('atlantis')).toBeUndefined();
  });

  it('ranks cities above bare country entries', () => {
    // A traveler typing a city wants the city, not the country that contains it.
    const kl = tripDestinations.find((item) => item.label === 'Kuala Lumpur');
    const malaysia = tripDestinations.find(
      (item) => item.kind === 'country' && item.label === 'Malaysia'
    );
    expect(kl?.weight).toBeGreaterThan(malaysia?.weight ?? 0);
  });

  it('carries the country as a searchable alias on every city', () => {
    // So typing "Malaysia" still surfaces Malaysian cities, not just the country.
    const kl = tripDestinations.find((item) => item.label === 'Kuala Lumpur');
    expect(kl?.aliases).toContain('Malaysia');
  });
});
