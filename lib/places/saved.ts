// ─────────────────────────────────────────────────────────────────────────────
// A traveler's saved-place library.
//
// NOT THE SAME THING AS lib/travel/savedPlaces.ts. That module files a place
// onto a TRIP — it resolves a guide's content_slug, finds or creates the trip
// for that country, and appends to the day_index 0 Ideas list. It is trip-bound
// by construction and it is unchanged.
//
// This is a bookmark of a CANONICAL place (migration 013), with no trip in it
// anywhere. A traveler may have one place in their library and on three trips;
// the two facts do not interact, and neither module knows about the other.
//
// EVERY FUNCTION HERE IS ONE ROUND TRIP, ON ONE INDEX, KEYED ON place_id.
//   Phase 1's review measured `resolveProviderPlace` at roughly eight round
//   trips per place, which is fine for a one-off verification and ruinous in a
//   loop. Nothing in this module calls it, and nothing here resolves, matches,
//   geocodes or verifies anything. A save takes a canonical id that the caller
//   already has.
//
// WHICH CLIENT: the CALLER'S session client, always. RLS is what confines a
// traveler to their own library — `saved_places_select_own` and its siblings in
// migration 014. There is no service-role path in this file, because there is
// nothing here that a traveler should not be doing for themselves.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { isUniqueViolation } from '@/lib/supabaseError';
import type { PlaceCategory } from './validation';
import type { VerificationStatus } from './repository';

/** The most places one library page asks for. */
export const SAVED_PLACES_PAGE_SIZE = 50;

/** A saved place, with the place attached — what a library screen renders. */
export interface SavedPlace {
  savedId: string;
  placeId: string;
  savedAt: string;
  collectionId: string | null;
  sourceImportId: string | null;
  name: string;
  localName: string | null;
  slug: string;
  countryName: string;
  countryCode: string | null;
  city: string | null;
  category: PlaceCategory;
  subcategory: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  website: string | null;
  phone: string | null;
  priceLevel: number | null;
  verificationStatus: VerificationStatus;
  /** How many travelers have saved this place. An aggregate, never a list. */
  saveCount: number;
}

interface SavedRow {
  saved_id: string;
  place_id: string;
  saved_at: string;
  collection_id: string | null;
  source_import_id: string | null;
  name: string;
  local_name: string | null;
  slug: string;
  country_name: string;
  country_code: string | null;
  city: string | null;
  category: string;
  subcategory: string | null;
  latitude: number | string;
  longitude: number | string;
  address: string | null;
  website: string | null;
  phone: string | null;
  price_level: number | null;
  verification_status: string;
  save_count: number | string;
}

/** Every column the library reads, from the view that joins them. */
const VIEW_COLUMNS =
  'saved_id,place_id,saved_at,collection_id,source_import_id,slug,name,local_name,' +
  'country_name,country_code,city,category,subcategory,latitude,longitude,address,' +
  'website,phone,price_level,verification_status,save_count';

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

const number = (value: number | string | null): number => {
  if (value === null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function toSavedPlace(row: SavedRow): SavedPlace {
  return {
    savedId: row.saved_id,
    placeId: row.place_id,
    savedAt: row.saved_at,
    collectionId: row.collection_id,
    sourceImportId: row.source_import_id,
    name: row.name,
    localName: row.local_name,
    slug: row.slug,
    countryName: row.country_name,
    countryCode: row.country_code,
    city: row.city,
    // Checked rather than cast, for the same reason as lib/places/repository.ts:
    // these two drive what the UI shows and how much a place is trusted.
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
    verificationStatus: STATUSES.includes(row.verification_status as VerificationStatus)
      ? (row.verification_status as VerificationStatus)
      : 'unverified',
    saveCount: number(row.save_count),
  };
}

export interface SaveResult {
  saved: true;
  /** True when it was already in the library, so nothing was written. */
  alreadySaved: boolean;
}

/**
 * Put a canonical place in the traveler's library.
 *
 * IDEMPOTENT, and idempotent in the database rather than in a check-then-write:
 * `saved_places_user_place_idx` is a unique index, so a second save is a
 * conflict rather than a duplicate. Reading first and inserting second would
 * leave a window between the two in which two taps produce two rows.
 *
 * Returns null when the write is refused — which is what a traveler saving a
 * place they cannot see looks like, because RLS on `places` decides that.
 */
export async function savePlace(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  options: { sourceImportId?: string | null } = {}
): Promise<SaveResult | null> {
  const { error } = await supabase.from('saved_places').insert({
    user_id: userId,
    place_id: placeId,
    source_import_id: options.sourceImportId ?? null,
  });

  if (!error) return { saved: true, alreadySaved: false };

  // Already in the library. Not an error: the traveler wanted it saved, and it
  // is saved. Decided by SQLSTATE 23505, never by the wording of a message.
  if (isUniqueViolation(error)) return { saved: true, alreadySaved: true };

  log.warn('saved_places.save_failed', { reason: error.message.slice(0, 160) });
  return null;
}

/**
 * Take a place out of the traveler's library.
 *
 * IDEMPOTENT: unsaving something that is not saved is a success, because the
 * caller's intent — "this should not be in my library" — is satisfied either
 * way. Returns whether a row was actually removed, which is what lets a UI tell
 * "removed" from "was not there".
 *
 * THIS CANNOT REACH THE CANONICAL PLACE. It deletes a row in `saved_places` and
 * nothing else; `place_id` is ON DELETE RESTRICT and `places` has no DELETE
 * policy at all. Unsaving the last save of a place leaves the place exactly
 * where it was, with a save_count of zero.
 */
export async function unsavePlace(
  supabase: SupabaseClient,
  userId: string,
  placeId: string
): Promise<{ removed: boolean }> {
  const { data, error } = await supabase
    .from('saved_places')
    .delete()
    .eq('user_id', userId)
    .eq('place_id', placeId)
    .select('id');

  if (error) {
    log.warn('saved_places.unsave_failed', { reason: error.message.slice(0, 160) });
    return { removed: false };
  }

  return { removed: (data ?? []).length > 0 };
}

/**
 * Is this place in the traveler's library?
 *
 * One indexed lookup with `head: true` — the unique index answers it without
 * reading a row. The `user_id` filter is redundant with RLS and kept anyway:
 * a query that states its own intent does not depend on a policy being right
 * to be correct.
 */
export async function isPlaceSaved(
  supabase: SupabaseClient,
  userId: string,
  placeId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('saved_places')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('place_id', placeId);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Which of these places are saved, in one query rather than one per card.
 *
 * A list of twenty places asking `isPlaceSaved` twenty times is the N+1 this
 * phase was told to avoid. Returns a Set of the ids that are saved.
 */
export async function savedPlaceIdsAmong(
  supabase: SupabaseClient,
  userId: string,
  placeIds: string[]
): Promise<Set<string>> {
  if (placeIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('saved_places')
    .select('place_id')
    .eq('user_id', userId)
    .in('place_id', placeIds);

  if (error || !data) return new Set();
  return new Set((data as { place_id: string }[]).map((row) => row.place_id));
}

export interface SavedPlacesQuery {
  /** Filter to one country, matching `places.country_name`. */
  destination?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * The traveler's library, newest first.
 *
 * Reads `saved_places_detailed`, the security_invoker view — so the join to
 * `places` happens once in the database, on indexes, subject to the same RLS as
 * a direct read. A place the traveler may no longer see (one marked `rejected`,
 * say) drops out of the list rather than rendering as a blank card.
 */
export async function getSavedPlaces(
  supabase: SupabaseClient,
  userId: string,
  query: SavedPlacesQuery = {}
): Promise<SavedPlace[]> {
  const limit = Math.min(Math.max(query.limit ?? SAVED_PLACES_PAGE_SIZE, 1), SAVED_PLACES_PAGE_SIZE);
  const offset = Math.max(query.offset ?? 0, 0);

  let builder = supabase
    .from('saved_places_detailed')
    .select(VIEW_COLUMNS)
    .eq('user_id', userId);

  if (query.destination) builder = builder.eq('country_name', query.destination);

  const { data, error } = await builder
    .order('saved_at', { ascending: false })
    .limit(limit + offset);

  if (error || !data) {
    if (error) log.warn('saved_places.list_failed', { reason: error.message.slice(0, 160) });
    return [];
  }

  return (data as unknown as SavedRow[]).slice(offset).map(toSavedPlace);
}

/**
 * The same list, narrowed to one country.
 *
 * A thin wrapper on purpose: "saved places in Thailand" is a distinct thing a
 * caller asks for, and naming it means the filter is applied in the database
 * every time rather than in whichever component remembered to.
 */
export async function getSavedPlacesByDestination(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  query: Omit<SavedPlacesQuery, 'destination'> = {}
): Promise<SavedPlace[]> {
  return getSavedPlaces(supabase, userId, { ...query, destination });
}

/** Which countries the traveler has saved places in, for a filter control. */
export async function getSavedDestinations(
  supabase: SupabaseClient,
  userId: string
): Promise<{ destination: string; count: number }[]> {
  const { data, error } = await supabase
    .from('saved_places_detailed')
    .select('country_name')
    .eq('user_id', userId)
    .limit(SAVED_PLACES_PAGE_SIZE);

  if (error || !data) return [];

  const tally = new Map<string, number>();
  for (const row of data as unknown as { country_name: string }[]) {
    tally.set(row.country_name, (tally.get(row.country_name) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([destination, count]) => ({ destination, count }))
    .sort((a, b) => b.count - a.count || a.destination.localeCompare(b.destination));
}

/**
 * How many travelers have saved each of these places.
 *
 * Reads the maintained counter, never `COUNT(*)` over `saved_places`. One query
 * for a whole screen of cards, and its cost does not grow as the product does.
 *
 * `place_stats` holds a place id and a number and nothing else, which is what
 * makes it safe to be the one publicly-readable table here: an aggregate that
 * can be joined back to a person is not an aggregate.
 */
export async function getSaveCounts(
  supabase: SupabaseClient,
  placeIds: string[]
): Promise<Map<string, number>> {
  if (placeIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('place_stats')
    .select('place_id,save_count')
    .in('place_id', placeIds);

  if (error || !data) return new Map();

  return new Map(
    (data as { place_id: string; save_count: number | string }[]).map((row) => [
      row.place_id,
      number(row.save_count),
    ])
  );
}
