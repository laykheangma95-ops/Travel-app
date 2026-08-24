// ─────────────────────────────────────────────────────────────────────────────
// The sandbox places provider.
//
// WHAT IT IS FOR:
//   Exercising the whole resolve → verify → link path with no vendor, no key
//   and no bill. It is the same role SandboxEsimProvider plays for fulfilment:
//   the pipeline is real, the supplier is not.
//
// WHY THERE IS NO REAL ADAPTER IN THIS PHASE:
//   Because activating paid API usage was explicitly out of scope. The port is
//   what this phase delivers; a Google/Mapbox/HERE adapter is one file that
//   implements it, plus one `register()` line, plus a `ServiceName` in
//   lib/env.ts — and an owner decision about a bill and about what a vendor's
//   terms permit us to store.
//
// IT CANNOT REACH PRODUCTION BY ACCIDENT.
//   The registry refuses to select it when demo behaviour is not allowed
//   (lib/env.ts `demoModeAllowed`). A fixture that could mark places
//   `provider_verified` on the live site would be worse than having no provider
//   at all — it would put the word "verified" on data nobody verified.
//
// NO NETWORK. Nothing here fetches, so it cannot be an SSRF hole and cannot be
// slow.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePlaceName } from '@/lib/places/normalize';
import { parseProviderPlace } from '@/lib/places/validation';
import type {
  PlacesProvider,
  PlaceSearchQuery,
  PlaceSearchResult,
  ProviderPlace,
} from './types';

export const SANDBOX_PROVIDER_ID = 'sandbox';

/**
 * A handful of real, well-known places on the Cambodia → China route the
 * product is built around. Real coordinates, because a fixture with invented
 * coordinates teaches the resolver to accept nonsense.
 */
const FIXTURES = [
  {
    providerPlaceId: 'sandbox:wat-pho',
    name: 'Wat Pho',
    localName: 'วัดโพธิ์',
    countryCode: 'TH',
    countryName: 'Thailand',
    city: 'Bangkok',
    latitude: 13.7465,
    longitude: 100.4927,
    address: '2 Sanamchai Road, Phra Borom Maha Ratchawang, Bangkok',
    category: 'spot' as const,
    subcategory: 'temple',
  },
  {
    providerPlaceId: 'sandbox:jodd-fairs',
    name: 'Jodd Fairs Rama 9',
    localName: 'ตลาดนัดจ๊อดแฟร์',
    countryCode: 'TH',
    countryName: 'Thailand',
    city: 'Bangkok',
    latitude: 13.7563,
    longitude: 100.5665,
    address: 'Rama IX Road, Huai Khwang, Bangkok',
    category: 'food' as const,
    subcategory: 'night market',
  },
  {
    providerPlaceId: 'sandbox:the-bund',
    name: 'The Bund',
    localName: '外滩',
    countryCode: 'CN',
    countryName: 'China',
    city: 'Shanghai',
    latitude: 31.2397,
    longitude: 121.4909,
    address: 'Zhongshan East 1st Road, Huangpu, Shanghai',
    category: 'spot' as const,
    subcategory: 'waterfront',
  },
  {
    providerPlaceId: 'sandbox:angkor-wat',
    name: 'Angkor Wat',
    localName: 'ប្រាសាទអង្គរវត្ត',
    countryCode: 'KH',
    countryName: 'Cambodia',
    city: 'Siem Reap',
    latitude: 13.4125,
    longitude: 103.867,
    address: 'Krong Siem Reap, Cambodia',
    category: 'spot' as const,
    subcategory: 'temple',
  },
];

/** Every fixture, as a validated ProviderPlace. Built once. */
const CATALOGUE: ProviderPlace[] = FIXTURES.map((fixture) => {
  const place = parseProviderPlace({
    providerId: SANDBOX_PROVIDER_ID,
    providerPlaceId: fixture.providerPlaceId,
    name: fixture.name,
    localName: fixture.localName,
    countryCode: fixture.countryCode,
    countryName: fixture.countryName,
    city: fixture.city,
    district: null,
    neighborhood: null,
    latitude: fixture.latitude,
    longitude: fixture.longitude,
    address: fixture.address,
    website: null,
    phone: null,
    priceLevel: null,
    category: fixture.category,
    subcategory: fixture.subcategory,
  });
  // The fixtures go through the same door as a real vendor's payload. If one
  // of them cannot pass it, the fixture is wrong and should fail loudly at
  // import rather than quietly at 3am.
  if (!place) throw new Error(`sandbox fixture is invalid: ${fixture.providerPlaceId}`);
  return place;
});

export class SandboxPlacesProvider implements PlacesProvider {
  readonly id = SANDBOX_PROVIDER_ID;

  /** No credentials to have, so always available where it is allowed at all. */
  isConfigured(): boolean {
    return true;
  }

  async search(query: PlaceSearchQuery): Promise<PlaceSearchResult[]> {
    const needle = normalizePlaceName(query.text);
    if (!needle) return [];

    const country = query.countryCode?.toUpperCase() ?? null;

    return CATALOGUE.filter((place) => {
      if (country && place.countryCode && place.countryCode !== country) return false;
      const haystack = normalizePlaceName(place.name);
      const local = place.localName ? normalizePlaceName(place.localName) : '';
      return haystack.includes(needle) || needle.includes(haystack) || (local && local === needle);
    })
      .slice(0, query.limit ?? 5)
      .map((place) => ({
        providerId: this.id,
        providerPlaceId: place.providerPlaceId,
        name: place.name,
        formattedAddress: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        // An exact normalized-name match is as sure as this fixture gets; a
        // substring match is a maybe, and says so rather than claiming 1.
        confidence: normalizePlaceName(place.name) === needle ? 0.95 : 0.6,
      }));
  }

  async getDetails(providerPlaceId: string): Promise<ProviderPlace | null> {
    return CATALOGUE.find((place) => place.providerPlaceId === providerPlaceId) ?? null;
  }
}
