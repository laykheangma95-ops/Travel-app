// ─────────────────────────────────────────────────────────────────────────────
// The door into the place registry.
//
// Every value that reaches `places` passes through here first — a traveler's
// form, a provider's payload, and (later) a model's guess. lib/travel's
// importer has exactly one such door, `normaliseCandidate`, and it is the
// reason a model returning a latitude of 900 has never been an incident. This
// is the same idea for canonical places.
//
// A provider is not more trusted than a model here. It is more AUTHORITATIVE —
// it is allowed to raise a place to `provider_verified`, which a model is not —
// but its payload is still somebody else's JSON arriving over a network, and it
// gets checked like any other.
//
// Pure and client-safe: zod only, no database, no network, no secrets.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

/**
 * The same six categories as `destination_places` (migration 008 widened it to
 * include 'stay'). A registry with its own vocabulary would need a translation
 * on every read, and translations drift.
 */
export const PLACE_CATEGORIES = ['spot', 'food', 'shopping', 'transport', 'stay', 'other'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_NAME_MAX = 200;
const TEXT_MAX = 300;

/** Matches the CHECK constraints in migration 013, so a rejection is ours. */
const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);

/**
 * A website, or nothing.
 *
 * http/https only. A `javascript:` or `data:` URL from a provider payload would
 * otherwise be stored and later rendered as a link, which is a stored-XSS
 * delivery mechanism handed to us by a third party.
 */
const website = z
  .string()
  .trim()
  .max(TEXT_MAX)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'website must be an http(s) URL')
  .nullable()
  .default(null);

const optionalText = (max = TEXT_MAX) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null);

/**
 * A canonical place as the application asks for it.
 *
 * `verificationStatus` is absent on purpose. Nothing may request a verification
 * level — it is decided by the repository and enforced by RLS and a trigger in
 * migration 013. A field here would imply otherwise.
 */
export const canonicalPlaceInput = z
  .object({
    name: z.string().trim().min(1).max(PLACE_NAME_MAX),
    localName: optionalText(PLACE_NAME_MAX),
    /** Matches `trip_plans.destination` — the key everything already joins on. */
    countryName: z.string().trim().min(1).max(120),
    /** ISO-3166-1 alpha-2, upper case. Null when nothing authoritative said. */
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    city: optionalText(120),
    district: optionalText(120),
    neighborhood: optionalText(120),
    category: z.enum(PLACE_CATEGORIES).default('other'),
    subcategory: optionalText(80),
    latitude,
    longitude,
    address: optionalText(),
    website,
    phone: optionalText(40),
    priceLevel: z.number().int().min(1).max(4).nullable().default(null),
  })
  .strict();

export type CanonicalPlaceInput = z.input<typeof canonicalPlaceInput>;
export type CanonicalPlace = z.output<typeof canonicalPlaceInput>;

/**
 * What an adapter must hand back, checked before it enters application logic.
 *
 * Coordinates are required here and nowhere else optional: a provider result
 * with no location is not a verification of anything, and letting one through
 * would put an unlocatable row into the registry under the word "verified".
 */
export const providerPlaceShape = z
  .object({
    providerId: z.string().trim().min(1).max(40),
    providerPlaceId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(PLACE_NAME_MAX),
    localName: optionalText(PLACE_NAME_MAX),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    countryName: optionalText(120),
    city: optionalText(120),
    district: optionalText(120),
    neighborhood: optionalText(120),
    latitude,
    longitude,
    address: optionalText(),
    website,
    phone: optionalText(40),
    priceLevel: z.number().int().min(1).max(4).nullable().default(null),
    category: z.enum(PLACE_CATEGORIES).default('other'),
    subcategory: optionalText(80),
  })
  .strict();

/**
 * A provider payload, or null.
 *
 * Null rather than a throw: one malformed result among ten must cost that one
 * result, not the search. The adapter has already logged the failure; the
 * caller simply has one fewer candidate.
 */
export function parseProviderPlace(value: unknown): z.output<typeof providerPlaceShape> | null {
  const parsed = providerPlaceShape.safeParse(value);
  return parsed.success ? parsed.data : null;
}
