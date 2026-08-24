// ─────────────────────────────────────────────────────────────────────────────
// The places provider port.
//
// WHAT MATTERS HERE:
//   1. A vendor's payload becomes a Domner type BEFORE it reaches application
//      logic, and a malformed one becomes nothing at all.
//   2. The default is NO provider. Domner ships today with no maps vendor, and
//      an empty .env must keep working.
//   3. The sandbox cannot reach production. A fixture that could stamp
//      `provider_verified` on a live place would put the word "verified" on
//      data nobody verified.
//   4. A second adapter is one file. The fake below implements the port and
//      the registry serves it with no other change — which is the whole claim
//      the abstraction makes.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseProviderPlace } from '@/lib/places/validation';
import { SandboxPlacesProvider } from '@/lib/providers/places/sandbox';
import {
  __registerPlacesProviderForTest,
  __resetPlacesProvidersForTest,
  getPlacesProvider,
  placesProviderConfigured,
} from '@/lib/providers/places/registry';
import {
  PlacesProviderError,
  type PlacesProvider,
  type PlaceSearchResult,
  type ProviderPlace,
} from '@/lib/providers/places/types';

afterEach(() => {
  vi.unstubAllEnvs();
  __resetPlacesProvidersForTest();
});

describe('the registry', () => {
  it('has no provider by default', () => {
    // The state Domner is in today, and the state an empty .env must work in.
    expect(getPlacesProvider()).toBeNull();
    expect(placesProviderConfigured()).toBe(false);
  });

  it('serves the sandbox outside production', () => {
    vi.stubEnv('PLACES_PROVIDER', 'sandbox');
    expect(getPlacesProvider()?.id).toBe('sandbox');
  });

  it('refuses the sandbox in production', () => {
    vi.stubEnv('PLACES_PROVIDER', 'sandbox');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DOMNER_ALLOW_DEMO', '');
    // Fixtures must never be able to mark a live place verified.
    expect(getPlacesProvider()).toBeNull();
  });

  it('allows the sandbox on a staging deploy that opted in', () => {
    vi.stubEnv('PLACES_PROVIDER', 'sandbox');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DOMNER_ALLOW_DEMO', 'true');
    expect(getPlacesProvider()?.id).toBe('sandbox');
  });

  it('returns null for a provider that is not registered', () => {
    vi.stubEnv('PLACES_PROVIDER', 'a-vendor-we-never-wrote');
    expect(getPlacesProvider()).toBeNull();
  });

  it('skips an adapter that has no credentials', () => {
    class Unconfigured implements PlacesProvider {
      readonly id = 'unconfigured';
      isConfigured() {
        return false;
      }
      async search(): Promise<PlaceSearchResult[]> {
        throw new Error('must not be called');
      }
      async getDetails(): Promise<ProviderPlace | null> {
        throw new Error('must not be called');
      }
    }
    __registerPlacesProviderForTest(new Unconfigured());
    vi.stubEnv('PLACES_PROVIDER', 'unconfigured');
    expect(getPlacesProvider()).toBeNull();
  });

  it('serves a second adapter with no change to anything else', () => {
    // The claim the port makes: a new vendor is one file plus one register().
    class Fake implements PlacesProvider {
      readonly id = 'fake-vendor';
      isConfigured() {
        return true;
      }
      async search(): Promise<PlaceSearchResult[]> {
        return [];
      }
      async getDetails(): Promise<ProviderPlace | null> {
        return null;
      }
    }
    __registerPlacesProviderForTest(new Fake());
    vi.stubEnv('PLACES_PROVIDER', 'fake-vendor');
    expect(getPlacesProvider()?.id).toBe('fake-vendor');
  });
});

describe('the sandbox adapter', () => {
  const provider = new SandboxPlacesProvider();

  it('searches on the normalized name, not the literal one', async () => {
    const results = await provider.search({ text: '  wat  pho!  ' });
    expect(results).toHaveLength(1);
    expect(results[0].providerPlaceId).toBe('sandbox:wat-pho');
    expect(results[0].confidence).toBe(0.95);
  });

  it('honours the country filter and the limit', async () => {
    expect(await provider.search({ text: 'wat pho', countryCode: 'CN' })).toEqual([]);
    const all = await provider.search({ text: 'the bund', countryCode: 'CN' });
    expect(all[0].name).toBe('The Bund');
    expect(await provider.search({ text: 'a', limit: 1 })).toHaveLength(1);
  });

  it('returns details in Domner types, and null for an unknown id', async () => {
    const place = await provider.getDetails('sandbox:angkor-wat');
    expect(place).toMatchObject({
      providerId: 'sandbox',
      name: 'Angkor Wat',
      countryCode: 'KH',
      countryName: 'Cambodia',
      category: 'spot',
    });
    // The local-script name is a separate field from the caption's name — it is
    // what a taxi driver will recognise.
    expect(place?.localName).toBe('ប្រាសាទអង្គរវត្ត');
    expect(await provider.getDetails('sandbox:nope')).toBeNull();
  });

  it('never reaches the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await provider.search({ text: 'wat pho' });
    await provider.getDetails('sandbox:wat-pho');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('transforming a vendor payload into a Domner type', () => {
  const good = {
    providerId: 'sandbox',
    providerPlaceId: 'abc',
    name: 'Wat Pho',
    latitude: 13.7465,
    longitude: 100.4927,
  };

  it('fills what the vendor did not say with null, never with a guess', () => {
    const place = parseProviderPlace(good);
    expect(place).not.toBeNull();
    expect(place!.address).toBeNull();
    expect(place!.countryCode).toBeNull();
    expect(place!.priceLevel).toBeNull();
    // An unstated category is 'other', not an inference from the name.
    expect(place!.category).toBe('other');
  });

  it('rejects a payload with impossible coordinates', () => {
    expect(parseProviderPlace({ ...good, latitude: 900 })).toBeNull();
    expect(parseProviderPlace({ ...good, longitude: -181 })).toBeNull();
  });

  it('rejects a place with no id, no name, or no location', () => {
    expect(parseProviderPlace({ ...good, providerPlaceId: '' })).toBeNull();
    expect(parseProviderPlace({ ...good, name: '   ' })).toBeNull();
    expect(parseProviderPlace({ providerId: 'sandbox', providerPlaceId: 'a', name: 'x' })).toBeNull();
  });

  it('refuses a website that is not http(s)', () => {
    // A vendor payload is somebody else's JSON. Stored and later rendered as a
    // link, a javascript: URL is stored XSS handed to us by a third party.
    expect(parseProviderPlace({ ...good, website: 'javascript:alert(1)' })).toBeNull();
    expect(parseProviderPlace({ ...good, website: 'data:text/html,<script>' })).toBeNull();
    expect(parseProviderPlace({ ...good, website: 'https://watpho.com' })?.website).toBe(
      'https://watpho.com'
    );
  });

  it('refuses a vendor field we do not know about', () => {
    // .strict(), like the trip draft schema: an unknown key means an adapter
    // that is passing a vendor's payload through instead of mapping it.
    expect(parseProviderPlace({ ...good, rating: 4.5 })).toBeNull();
  });

  it('normalizes a country code to upper case and refuses a malformed one', () => {
    expect(parseProviderPlace({ ...good, countryCode: 'th' })?.countryCode).toBe('TH');
    expect(parseProviderPlace({ ...good, countryCode: 'THA' })).toBeNull();
  });
});

describe('PlacesProviderError', () => {
  it('says whether the caller should try again', () => {
    const transient = new PlacesProviderError('sandbox', 'rate limited', { retryable: true });
    const permanent = new PlacesProviderError('sandbox', 'no such id');
    expect(transient.retryable).toBe(true);
    // Not retryable unless the adapter says so: retrying a malformed request
    // just spends the budget twice.
    expect(permanent.retryable).toBe(false);
    expect(permanent.providerId).toBe('sandbox');
  });
});
