// ─────────────────────────────────────────────────────────────────────────────
// The canonical place repository.
//
// One question, answered in one place: "is this a place we already know?"
//
// THE RESOLUTION ORDER, strongest evidence first:
//   1. A trusted provider's id. If Google says ChIJ… and we have already mapped
//      ChIJ… to a canonical place, that is not a guess, it is the same place.
//      One id, one row, however many travelers save it.
//   2. Proximity plus name. Two records with the same normalized name within
//      150 metres are the same place. This is what catches the hundred imports
//      of one night market that arrive before any provider is configured.
//   3. Neither — so it is new, and it is created as `unverified`.
//
// WHICH CLIENT EACH FUNCTION EXPECTS, and why it matters:
//   • Traveler-facing functions take the CALLER'S session client. RLS then
//     decides what they can see (published places, plus their own submissions)
//     and what they can write (their own, `unverified`, and nothing else).
//   • Verification and promotion take the SERVICE-ROLE client, because they do
//     things RLS exists to forbid a traveler from doing. Those functions are
//     the only path to `provider_verified` and `domner_public`, and there is no
//     request body anywhere that reaches them.
//
// This module never talks to a maps vendor. It takes an already-normalized
// `ProviderPlace` (lib/providers/places/types.ts) and stores it.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { isUniqueViolation, violatedConstraint } from '@/lib/supabaseError';
import type { ProviderPlace } from '@/lib/providers/places/types';
import {
  boundingBox,
  distanceMeters,
  normalizePlaceName,
  placeSlug,
  proximityConfidence,
  SAME_PLACE_RADIUS_M,
} from './normalize';
import { canonicalPlaceInput, type CanonicalPlaceInput, type PlaceCategory } from './validation';

/** Every column the application reads. Listed once so a shape change is one edit. */
const COLUMNS =
  'id,slug,name,local_name,name_normalized,country_name,country_code,city,district,neighborhood,' +
  'category,subcategory,latitude,longitude,address,website,phone,price_level,' +
  'verification_status,verified_at,created_by';

export type VerificationStatus = 'unverified' | 'provider_verified' | 'domner_public' | 'rejected';

/**
 * The two unique indexes on `places`, by name. They mean different things and
 * the insert path has to tell them apart: identity means "this place already
 * exists" and is a success, slug means "this handle is taken" and is a retry.
 * Named here so a rename in the migration breaks the build rather than the
 * behaviour.
 */
const IDENTITY_CONSTRAINT = 'places_identity_idx';
const SLUG_CONSTRAINT = 'places_slug_key';

/** A canonical place, in application shape. */
export interface RegistryPlace {
  id: string;
  slug: string;
  name: string;
  localName: string | null;
  countryName: string;
  countryCode: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  category: PlaceCategory;
  subcategory: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  website: string | null;
  phone: string | null;
  priceLevel: number | null;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  createdBy: string | null;
}

/**
 * The row as PostgREST returns it. supabase-js cannot infer a shape from a
 * column list built by concatenation, so every read casts through `unknown`
 * into this — which is why `toRegistryPlace` re-checks the fields where being
 * wrong would matter.
 */
interface PlaceRow {
  id: string;
  slug: string;
  name: string;
  local_name: string | null;
  country_name: string;
  country_code: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  category: string;
  subcategory: string | null;
  latitude: number | string;
  longitude: number | string;
  address: string | null;
  website: string | null;
  phone: string | null;
  price_level: number | null;
  verification_status: string;
  verified_at: string | null;
  created_by: string | null;
}

const number = (value: number | string): number =>
  typeof value === 'number' ? value : Number(value);

const CATEGORIES: readonly PlaceCategory[] = [
  'spot',
  'food',
  'shopping',
  'transport',
  'stay',
  'other',
];

const STATUSES: readonly VerificationStatus[] = [
  'unverified',
  'provider_verified',
  'domner_public',
  'rejected',
];

/**
 * The stored verification level, or the least trusting one.
 *
 * A CHECK constraint means an unrecognised value should be impossible — but
 * "should be impossible" is precisely where an unchecked cast turns a bad
 * migration into a published place. The failure direction matters: an unknown
 * value degrades to `unverified`, so a row we cannot understand is never
 * treated as trusted. It is logged, because silently downgrading a place is
 * also not something to do quietly.
 */
function toVerificationStatus(value: string, placeId: string): VerificationStatus {
  if (STATUSES.includes(value as VerificationStatus)) return value as VerificationStatus;
  log.error('place_registry.unknown_verification_status', { placeId, value: value.slice(0, 40) });
  return 'unverified';
}

/**
 * A stored row into application shape.
 *
 * The two fields the application makes decisions on — `category`, which drives
 * the UI, and `verification_status`, which decides whether a place is treated
 * as trusted — are checked against their known values rather than cast. The
 * rest are carried through as read: they are display text, and a wrong string
 * in a description is a cosmetic problem where a wrong verification level is a
 * security one.
 */
function toRegistryPlace(row: PlaceRow): RegistryPlace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    localName: row.local_name,
    countryName: row.country_name,
    countryCode: row.country_code,
    city: row.city,
    district: row.district,
    neighborhood: row.neighborhood,
    category: CATEGORIES.includes(row.category as PlaceCategory)
      ? (row.category as PlaceCategory)
      : 'other',
    subcategory: row.subcategory,
    latitude: number(row.latitude),
    longitude: number(row.longitude),
    address: row.address,
    website: row.website,
    phone: row.phone,
    priceLevel: row.price_level,
    verificationStatus: toVerificationStatus(row.verification_status, row.id),
    verifiedAt: row.verified_at,
    createdBy: row.created_by,
  };
}

/** How a place was arrived at. Recorded so a wrong merge is explainable. */
export type MatchStrategy = 'provider-id' | 'proximity' | 'created';

export interface PlaceResolution {
  place: RegistryPlace;
  matchedBy: MatchStrategy;
  /** 0–1 for a match; 1 for a row we just created (it is trivially itself). */
  confidence: number;
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/** One place by id, subject to whatever the passed client is allowed to see. */
export async function getPlaceById(
  supabase: SupabaseClient,
  placeId: string
): Promise<RegistryPlace | null> {
  const { data, error } = await supabase.from('places').select(COLUMNS).eq('id', placeId).maybeSingle();
  if (error || !data) return null;
  return toRegistryPlace(data as unknown as PlaceRow);
}

/**
 * The canonical place a provider's id already maps to, if any.
 *
 * THIS IS THE "100 USERS, 1 PLACE" LOOKUP. The unique index on
 * (provider, provider_place_id) is what guarantees the answer is singular.
 *
 * Expects the service-role client: mappings are readable through RLS only for
 * published places, and a mapping's whole job is to be found before a place is
 * published.
 */
export async function findPlaceByProviderId(
  admin: SupabaseClient,
  provider: string,
  providerPlaceId: string
): Promise<RegistryPlace | null> {
  const { data, error } = await admin
    .from('place_external_ids')
    .select('place_id')
    .eq('provider', provider)
    .eq('provider_place_id', providerPlaceId)
    .maybeSingle();

  if (error || !data) return null;
  return getPlaceById(admin, (data as { place_id: string }).place_id);
}

export interface NearbyMatch {
  place: RegistryPlace;
  meters: number;
  confidence: number;
}

/**
 * Places with this name within `radiusMeters`, nearest first.
 *
 * The name is matched on its normalized form, computed here by the same
 * function the database's generated column uses. The radius is applied as a
 * bounding box in SQL — which an index can serve — and then as a true
 * great-circle distance in JavaScript, because a box is not a circle and the
 * corners of one are 40% further away than the edges.
 */
export async function findNearbyByName(
  supabase: SupabaseClient,
  input: { name: string; lat: number; lng: number; radiusMeters?: number }
): Promise<NearbyMatch[]> {
  const normalized = normalizePlaceName(input.name);
  // An empty key would match every row whose name is also unusable. That is not
  // a match, it is a collision, so it is refused here rather than resolved.
  if (!normalized) return [];

  const radius = input.radiusMeters ?? SAME_PLACE_RADIUS_M;
  const box = boundingBox({ lat: input.lat, lng: input.lng }, radius);

  const { data, error } = await supabase
    .from('places')
    .select(COLUMNS)
    .eq('name_normalized', normalized)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng)
    .limit(50);

  if (error || !data) return [];

  return (data as unknown as PlaceRow[])
    .map((row) => {
      const place = toRegistryPlace(row);
      const meters = distanceMeters(
        { lat: input.lat, lng: input.lng },
        { lat: place.latitude, lng: place.longitude }
      );
      return { place, meters, confidence: proximityConfidence(meters) };
    })
    .filter((match) => match.meters <= radius)
    .sort((a, b) => a.meters - b.meters);
}

// ── Creation ─────────────────────────────────────────────────────────────────

interface InsertOptions {
  createdBy: string | null;
  /** Only ever set by the service role. RLS refuses it from anyone else. */
  verificationStatus?: VerificationStatus;
}

/**
 * Insert a place, coping with the two unique indexes that can refuse it.
 *
 *   places_identity_idx — somebody else inserted this exact place between our
 *                         lookup and our insert. That is not an error: the row
 *                         we wanted now exists, so it is read back and returned.
 *   places_slug_key     — a different place wants the same handle. It gets a
 *                         suffix; the identity index is what decides sameness,
 *                         never the slug.
 */
async function insertPlace(
  supabase: SupabaseClient,
  place: ReturnType<typeof canonicalPlaceInput.parse>,
  options: InsertOptions
): Promise<{ place: RegistryPlace; created: boolean } | null> {
  const row = {
    name: place.name,
    local_name: place.localName,
    country_name: place.countryName,
    country_code: place.countryCode,
    city: place.city,
    district: place.district,
    neighborhood: place.neighborhood,
    category: place.category,
    subcategory: place.subcategory,
    latitude: place.latitude,
    longitude: place.longitude,
    address: place.address,
    website: place.website,
    phone: place.phone,
    price_level: place.priceLevel,
    created_by: options.createdBy,
    ...(options.verificationStatus ? { verification_status: options.verificationStatus } : {}),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = placeSlug(
      place.countryName,
      place.name,
      attempt === 0 ? undefined : Math.random().toString(36).slice(2, 7)
    );

    const { data, error } = await supabase
      .from('places')
      .insert({ ...row, slug })
      .select(COLUMNS)
      .single();

    if (!error && data) return { place: toRegistryPlace(data as unknown as PlaceRow), created: true };

    // SQLSTATE decides whether this was a unique violation at all; the
    // constraint name decides which one. Keyed on message text instead, both
    // branches below break silently the day the wording changes — the race
    // would stop recovering and start reporting no canonical place.
    if (!isUniqueViolation(error)) {
      log.warn('place_registry.insert_failed', {
        reason: (error?.message ?? 'unknown').slice(0, 160),
      });
      return null;
    }

    const constraint = violatedConstraint(error);

    if (constraint === IDENTITY_CONSTRAINT) {
      // Lost a race with an identical insert. The place exists — find it.
      const existing = await findNearbyByName(supabase, {
        name: place.name,
        lat: place.latitude,
        lng: place.longitude,
      });
      if (existing.length) return { place: existing[0].place, created: false };
      return null;
    }

    // A slug clash is the only thing worth retrying, and only with a new slug.
    // Any other unique violation is a constraint we did not anticipate, and
    // retrying it would just spend two more round trips to fail again.
    if (constraint !== SLUG_CONSTRAINT) {
      log.warn('place_registry.insert_refused', {
        constraint: constraint ?? 'unknown',
        reason: (error?.message ?? '').slice(0, 160),
      });
      return null;
    }
  }

  log.warn('place_registry.slug_exhausted', { name: place.name });
  return null;
}

/**
 * Find or create the canonical place for something a traveler is saving.
 *
 * TRAVELER-SCOPED. Takes the caller's session client, so:
 *   • the proximity search sees published places plus the traveler's own — it
 *     will never silently attach them to somebody else's unverified guess;
 *   • anything created is `unverified` and owned by them, because RLS permits
 *     nothing else. There is no argument to this function that changes that.
 *
 * Returns null when the input is invalid or the write is refused. The caller
 * treats that as "no canonical record", not as a failure of their save — which
 * is what keeps this phase additive: `destination_places` remains the thing a
 * trip actually points at.
 */
export async function resolvePlaceForTraveler(
  supabase: SupabaseClient,
  userId: string,
  input: CanonicalPlaceInput
): Promise<PlaceResolution | null> {
  const parsed = canonicalPlaceInput.safeParse(input);
  if (!parsed.success) {
    log.warn('place_registry.invalid_input', { issue: parsed.error.issues[0]?.message });
    return null;
  }
  const place = parsed.data;

  const nearby = await findNearbyByName(supabase, {
    name: place.name,
    lat: place.latitude,
    lng: place.longitude,
  });
  if (nearby.length) {
    return { place: nearby[0].place, matchedBy: 'proximity', confidence: nearby[0].confidence };
  }

  const inserted = await insertPlace(supabase, place, { createdBy: userId });
  if (!inserted) return null;

  return {
    place: inserted.place,
    matchedBy: inserted.created ? 'created' : 'proximity',
    confidence: 1,
  };
}

// ── Provider verification ────────────────────────────────────────────────────

/**
 * Map a provider's id onto a canonical place.
 *
 * SERVICE ROLE ONLY, and RLS enforces that rather than trusting this comment:
 * `place_external_ids` has no INSERT policy at all. A caller who could write a
 * mapping could claim a real provider id for a place they invented, and the
 * unique index would then refuse the genuine link when verification finally
 * ran — poisoning with no upside.
 *
 * Returns the place the id ALREADY belongs to when there is one, which is the
 * ordinary case for a popular place and is not an error.
 */
export async function linkProviderPlace(
  admin: SupabaseClient,
  placeId: string,
  provider: string,
  providerPlaceId: string,
  matchConfidence: number | null = null
): Promise<{ linked: boolean; existingPlaceId: string | null }> {
  const existing = await findPlaceByProviderId(admin, provider, providerPlaceId);
  if (existing) {
    return { linked: existing.id === placeId, existingPlaceId: existing.id };
  }

  const { error } = await admin.from('place_external_ids').insert({
    place_id: placeId,
    provider,
    provider_place_id: providerPlaceId,
    match_confidence: matchConfidence,
  });

  if (error) {
    log.warn('place_registry.link_failed', { provider, reason: error.message.slice(0, 160) });
    return { linked: false, existingPlaceId: null };
  }

  return { linked: true, existingPlaceId: null };
}

/**
 * Resolve a provider's place into the registry, and verify it.
 *
 * SERVICE ROLE ONLY. This is the only path to `provider_verified`, and it is
 * reachable only from server code that has already decided to trust this
 * provider result — never from a request body.
 *
 * The order is the whole design: the provider's id is checked first, so the
 * hundredth traveler to save a place gets the same row as the first, and no
 * amount of spelling variation in captions can produce a second one.
 */
export async function resolveProviderPlace(
  admin: SupabaseClient,
  provider: ProviderPlace
): Promise<PlaceResolution | null> {
  // 1. Strongest evidence: we have seen this exact provider id before.
  const byId = await findPlaceByProviderId(admin, provider.providerId, provider.providerPlaceId);
  if (byId) return { place: byId, matchedBy: 'provider-id', confidence: 1 };

  const parsed = canonicalPlaceInput.safeParse({
    name: provider.name,
    localName: provider.localName,
    // A provider that does not name the country cannot be filed by country, and
    // guessing one from coordinates is exactly the kind of invention this
    // registry exists to keep out. Its own country field is used, or nothing.
    countryName: provider.countryName ?? provider.countryCode ?? 'Unknown',
    countryCode: provider.countryCode,
    city: provider.city,
    district: provider.district,
    neighborhood: provider.neighborhood,
    category: provider.category,
    subcategory: provider.subcategory,
    latitude: provider.latitude,
    longitude: provider.longitude,
    address: provider.address,
    website: provider.website,
    phone: provider.phone,
    priceLevel: provider.priceLevel,
  });
  if (!parsed.success) {
    log.warn('place_registry.provider_payload_rejected', {
      provider: provider.providerId,
      issue: parsed.error.issues[0]?.message,
    });
    return null;
  }

  // 2. Same name, same 150 metres — an existing row this provider result is
  //    about. It gets the mapping and the verification rather than a twin.
  const nearby = await findNearbyByName(admin, {
    name: parsed.data.name,
    lat: parsed.data.latitude,
    lng: parsed.data.longitude,
  });

  let place: RegistryPlace;
  let matchedBy: MatchStrategy;
  let confidence: number;

  if (nearby.length) {
    place = nearby[0].place;
    matchedBy = 'proximity';
    confidence = nearby[0].confidence;
  } else {
    const inserted = await insertPlace(admin, parsed.data, { createdBy: null });
    if (!inserted) return null;
    place = inserted.place;
    matchedBy = inserted.created ? 'created' : 'proximity';
    confidence = 1;
  }

  await linkProviderPlace(
    admin,
    place.id,
    provider.providerId,
    provider.providerPlaceId,
    confidence
  );

  // 3. Now, and only now, the place may be called verified — the mapping the
  //    trigger in migration 013 insists on exists.
  const promoted = await promotePlace(admin, place.id, 'provider_verified', {
    actor: `provider:${provider.providerId}`,
    reason: 'matched a trusted provider record',
  });

  return { place: promoted.place ?? place, matchedBy, confidence };
}

// ── Promotion ────────────────────────────────────────────────────────────────

export interface PromotionContext {
  /** Who decided. A staff id or email for a human; `provider:<id>` otherwise. */
  actor: string;
  reason: string;
  /**
   * Publish a place that a provider has not verified. The human override, for
   * the editorial case: a place we know is real because we have been there.
   * Never available to a provider, and never a default.
   */
  override?: boolean;
}

export interface PromotionResult {
  status: 'promoted' | 'refused' | 'unchanged';
  place: RegistryPlace | null;
  reason?: string;
}

/**
 * Move a place between verification states, conservatively.
 *
 * THE RULES, and why they are these rules:
 *
 *   → provider_verified  requires a provider mapping. A trigger in migration
 *                        013 enforces it too, so a direct SQL UPDATE cannot
 *                        get around it either.
 *
 *   → domner_public      requires a human actor AND either a prior
 *                        `provider_verified` state or an explicit `override`.
 *                        A provider may not publish: a provider knowing a place
 *                        exists is not the same as us being willing to show it
 *                        to every traveler as fact.
 *
 *   → rejected           always allowed. Being able to say "this is wrong"
 *                        must never be the hard path.
 *
 * The AI pipeline has no route to any of this. It runs as a traveler, and RLS
 * confines a traveler to `unverified` — which is the point of the whole tier
 * system, and is asserted in tests/places.registry.rls.test.ts.
 */
export async function promotePlace(
  admin: SupabaseClient,
  placeId: string,
  target: VerificationStatus,
  context: PromotionContext
): Promise<PromotionResult> {
  const current = await getPlaceById(admin, placeId);
  if (!current) return { status: 'refused', place: null, reason: 'no such place' };
  if (current.verificationStatus === target) return { status: 'unchanged', place: current };

  if (target === 'provider_verified') {
    const { count, error } = await admin
      .from('place_external_ids')
      .select('id', { count: 'exact', head: true })
      .eq('place_id', placeId);
    if (error || !count) {
      return {
        status: 'refused',
        place: current,
        reason: 'a place cannot be provider_verified without a provider mapping',
      };
    }
  }

  if (target === 'domner_public') {
    if (context.actor.startsWith('provider:')) {
      return {
        status: 'refused',
        place: current,
        reason: 'a provider may not publish a place; publishing is a human decision',
      };
    }
    if (current.verificationStatus !== 'provider_verified' && !context.override) {
      return {
        status: 'refused',
        place: current,
        reason: 'publish requires provider verification, or an explicit override',
      };
    }
  }

  const { data, error } = await admin
    .from('places')
    .update({ verification_status: target })
    .eq('id', placeId)
    .select(COLUMNS)
    .single();

  if (error || !data) {
    log.warn('place_registry.promotion_failed', {
      placeId,
      target,
      reason: error?.message?.slice(0, 160) ?? 'no row',
    });
    return { status: 'refused', place: current, reason: error?.message ?? 'write refused' };
  }

  // Every change of trust level is on the record. There is no places audit
  // table yet, so this is the trail — actor and reason, never silent.
  log.info('place_registry.promoted', {
    placeId,
    from: current.verificationStatus,
    to: target,
    actor: context.actor,
    reason: context.reason,
    override: context.override ?? false,
  });

  return { status: 'promoted', place: toRegistryPlace(data as unknown as PlaceRow) };
}

// ── The link to a traveler's saved copy ──────────────────────────────────────

/**
 * Point a traveler's `destination_places` row at the canonical place it is a
 * copy of.
 *
 * Additive by design: the itinerary still reads `destination_places`, the trip
 * still points at the traveler's own row, and nothing breaks for a row that
 * never gets resolved. This is the seam the next phase uses to answer "how many
 * people saved this?" without changing how anything is saved.
 */
export async function attachCanonicalPlace(
  supabase: SupabaseClient,
  destinationPlaceId: string,
  canonicalPlaceId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('destination_places')
    .update({ canonical_place_id: canonicalPlaceId })
    .eq('id', destinationPlaceId);

  if (error) {
    log.warn('place_registry.attach_failed', { reason: error.message.slice(0, 160) });
    return false;
  }
  return true;
}
