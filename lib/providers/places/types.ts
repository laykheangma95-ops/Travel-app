// ─────────────────────────────────────────────────────────────────────────────
// The places provider PORT.
//
// WHY THIS EXISTS:
//   Same reason as lib/providers/esim/types.ts. A maps vendor is a dependency
//   we cannot control: pricing changes, terms change, coverage of small
//   Cambodian and Chinese businesses varies wildly between vendors, and some
//   vendors' terms restrict what we may store at all. Being able to change our
//   mind about that must be one adapter file plus one registry entry — not a
//   migration, and not a rewrite of the importer.
//
//   So nothing in Domner ever talks to a maps vendor directly. Everything goes
//   through this interface, and every vendor result is transformed into the
//   Domner types below BEFORE it reaches application logic. A vendor's field
//   names, id formats and category vocabulary stop at the adapter.
//
// THE CONTRACT:
//   • Adapters return normalized `ProviderPlace` values or throw
//     `PlacesProviderError`. They never return a vendor's raw payload.
//   • `providerPlaceId` is opaque to us. We store it, we match on it, we never
//     parse it. It is the vendor's identity for a place, not ours — ours is the
//     `places.id` it maps onto.
//   • A provider may know nothing about a field. That is `null`, never a
//     guess: an invented address is worse than a missing one.
//   • Adapters are responsible for their own timeout, retry and structured
//     logging, because only the adapter knows what its vendor's failures mean.
//
// WHAT A PROVIDER IS NOT ALLOWED TO DO:
//   Publish. A provider result can raise a place to `provider_verified` and no
//   further — `domner_public` is a deliberate server-side decision. See
//   lib/places/repository.ts and the RLS in migration 013.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlaceCategory } from '@/lib/places/validation';

/** What we ask a provider to look for. Vendor-neutral by construction. */
export interface PlaceSearchQuery {
  /** The name as a human wrote it — a caption, a search box, a pasted line. */
  text: string;
  /** Bias results toward here, when we have a hint. Never a filter. */
  near?: { lat: number; lng: number } | null;
  /** ISO-3166-1 alpha-2, when known. */
  countryCode?: string | null;
  /** Upper bound on results. Adapters must honour it — it is a cost control. */
  limit?: number;
}

/**
 * A place as a provider describes it, in Domner's vocabulary.
 *
 * This is the ONLY shape the application sees. Everything optional is `null`
 * when the provider did not say, and never filled in by inference.
 */
export interface ProviderPlace {
  /** Which adapter produced this, recorded on the mapping for attribution. */
  providerId: string;
  /** The vendor's own id. Opaque. Stored, matched on, never parsed. */
  providerPlaceId: string;

  name: string;
  /** The name in the local script, where the provider distinguishes them. */
  localName: string | null;

  countryCode: string | null;
  countryName: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;

  latitude: number;
  longitude: number;

  address: string | null;
  website: string | null;
  phone: string | null;
  /** 1–4, the near-universal convention. Null means the provider did not say. */
  priceLevel: number | null;

  /** Mapped into Domner's six categories by the adapter, never passed through. */
  category: PlaceCategory;
  /** The provider's own finer-grained label, kept verbatim for reference. */
  subcategory: string | null;
}

/** One candidate from a search, with the provider's own confidence in it. */
export interface PlaceSearchResult {
  providerId: string;
  providerPlaceId: string;
  name: string;
  /** A one-line human-readable location, for a disambiguation list. */
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  /** 0–1. Adapters that cannot express this return null rather than 1. */
  confidence: number | null;
}

/**
 * The port itself.
 *
 * Two methods, deliberately: search is how a name becomes candidates, details
 * is how a chosen candidate becomes a record. Keeping them apart is what lets
 * the expensive call (details) happen once, after a human has confirmed, rather
 * than for every guess in a carousel.
 */
export interface PlacesProvider {
  /** Our id for the adapter, e.g. 'sandbox'. Stored on every mapping. */
  readonly id: string;
  /** False when the adapter has no credentials. Never throws to say so. */
  isConfigured(): boolean;
  search(query: PlaceSearchQuery): Promise<PlaceSearchResult[]>;
  /** Null when the provider has no such place. Throws only on failure. */
  getDetails(providerPlaceId: string): Promise<ProviderPlace | null>;
}

/**
 * A provider failure, with the one fact the caller needs: try again, or stop.
 *
 * Mirrors ProviderError in lib/providers/esim/types.ts — a rate limit is worth
 * retrying and a malformed id is not, and only the adapter can tell them apart.
 */
export class PlacesProviderError extends Error {
  readonly providerId: string;
  readonly retryable: boolean;

  constructor(providerId: string, message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'PlacesProviderError';
    this.providerId = providerId;
    this.retryable = options.retryable ?? false;
  }
}
