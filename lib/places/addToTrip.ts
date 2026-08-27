// ─────────────────────────────────────────────────────────────────────────────
// Adding a CANONICAL place (migration 013's `places`) onto a trip.
//
// NOT A SECOND SAVE SYSTEM. lib/travel/savedPlaces.ts already answers "which
// trip does this go on?" for a guide's `contentSlug`; this reuses that answer
// verbatim (`resolveTrip`, `chosenTrip`, `isAlreadyOnTrip`, `addIdeaToTrip`)
// rather than reinterpreting it. The only genuinely new step is upstream of
// all of that: a canonical `places` row is not something `addIdeaToTrip` can
// point an `itinerary_places` row at directly — it takes a `destination_places`
// id, because that is still the table a trip's Ideas list is built from
// (migration 013's own header: "itinerary_days, itinerary_places and
// trip_plans are untouched"). So this module's job is narrow: turn an
// authorized canonical place into the traveler's own `destination_places` row
// for it — reusing one if it already exists — and then hand off.
//
// WHY EVERY FUNCTION TAKES `supabase`: the CALLER'S session client, always.
// `getPlaceById` is what decides whether the caller may even see this place
// (`places_read_public_or_own`, migration 013) — a UUID in a URL is never
// treated as proof of anything by itself. Everything downstream runs under
// the same RLS that already confines a traveler to their own trips
// (`trips_all_own`), days and itinerary rows (migration 007), and their own
// `destination_places` rows (migration 009). No service-role client appears
// anywhere in this file.
//
// A PRINCIPLE THE REVIEW ADDED: this module may REUSE a traveler's own row,
// but it may never REASSIGN one — every path below either returns a row that
// is PROVABLY the requested canonical place, or creates a new one. It never
// returns success while having filed a different place, and it never mutates
// a pre-existing row's identity on a guess.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/http';
import { isUniqueViolation } from '@/lib/supabaseError';
import { PLACE_NAME_MAX } from '@/lib/travel/itinerary';
import {
  addIdeaToTrip,
  chosenTrip,
  isAlreadyOnTrip,
  resolveTrip,
} from '@/lib/travel/savedPlaces';
import { getPlaceById, type RegistryPlace } from './repository';

export type AddPlaceToTripResult =
  | {
      status: 'added';
      tripId: string;
      tripTitle: string;
      createdTrip: boolean;
      /** True when the place was already on this trip, so nothing was written. */
      alreadyAdded: boolean;
    }
  | { status: 'needsChoice'; candidates: { id: string; title: string }[] };

/**
 * A `destination_places` row this traveler already made for this exact
 * canonical place, if one exists — or null.
 *
 * `(created_by, canonical_place_id)` carries NO unique constraint (only
 * `canonical_place_id` alone is indexed, migration 013). Two rows CAN and DO
 * end up pointing at the same canonical place for one traveler: two imports
 * whose raw captions differ only in case ("Wat Pho" vs "WAT PHO") pass
 * `destination_places_owner_name_idx` — UNIQUE on the RAW name — as two
 * distinct rows, while the canonical resolver matches on the NORMALIZED name
 * and folds them onto one `places` row. `.maybeSingle()` would throw on that
 * second row (PostgREST's PGRST116, "multiple rows returned"); `.limit(1)`
 * with an explicit read of the first row degrades correctly instead.
 *
 * Exported for lib/travel/placeImport.ts's `insertOrReuseDestinationPlace` —
 * Phase 13.5's remediation for the wrong-place merge finding. Reuse there is
 * held to the SAME rule this file already enforces: a row is only ever
 * reused when it is PROVABLY the requested canonical place, via this exact
 * lookup, never a second one built to a looser standard.
 */
export async function findMaterializedRow(
  supabase: SupabaseClient,
  userId: string,
  canonicalPlaceId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('destination_places')
    .select('id')
    .eq('created_by', userId)
    .eq('canonical_place_id', canonicalPlaceId)
    .limit(1);
  if (error) throw new ApiError('INTERNAL', 'Could not check your saved places.');
  return data && data.length > 0 ? (data[0].id as string) : null;
}

/**
 * The traveler's own row with this exact (destination, name), if any.
 *
 * Backed by `destination_places_owner_name_idx` — UNIQUE (created_by,
 * destination, name), migration 009 — so at most one row can ever match.
 * `.maybeSingle()` is provably safe here, unlike the lookup above.
 */
/**
 * Exported for lib/travel/placeImport.ts's `insertPlace`, which hits the same
 * `destination_places_owner_name_idx` collision on a plain name (no canonical
 * id to disambiguate by yet) and needs the identical lookup — never a second,
 * slightly different query against the same unique index (rule 9/11).
 */
export async function findNameCollision(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  name: string
): Promise<{ id: string; canonicalPlaceId: string | null } | null> {
  const { data, error } = await supabase
    .from('destination_places')
    .select('id, canonical_place_id')
    .eq('created_by', userId)
    .eq('destination', destination)
    .eq('name', name)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not add that place to your trip.');
  if (!data) return null;
  return {
    id: data.id as string,
    canonicalPlaceId: (data.canonical_place_id as string | null) ?? null,
  };
}

/**
 * A name that will never collide with an unrelated row of the traveler's,
 * deterministically. Keyed on the canonical place's OWN id — never on
 * randomness — so a retried request, or two concurrent requests, for the
 * SAME canonical place converge on the SAME disambiguated name and therefore
 * the SAME row, rather than each attempt minting a new one.
 *
 * Exported for lib/travel/placeImport.ts's `insertOrReuseDestinationPlace` —
 * the SAME suffix strategy, not a second one, for the same canonical-id
 * collision this file already solved (Phase 13.5).
 */
export function disambiguatedName(name: string, canonicalPlaceId: string): string {
  const suffix = ` (${canonicalPlaceId.slice(0, 8)})`;
  const base = name.slice(0, Math.max(0, PLACE_NAME_MAX - suffix.length));
  return `${base}${suffix}`;
}

/** One insert attempt. Null means `destination_places_owner_name_idx` refused it. */
async function tryInsertDestinationPlace(
  supabase: SupabaseClient,
  userId: string,
  place: RegistryPlace,
  name: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('destination_places')
    .insert({
      destination: place.countryName,
      name,
      category: place.category,
      lat: place.latitude,
      lng: place.longitude,
      description: '',
      source: 'ai_generated',
      created_by: userId,
      canonical_place_id: place.id,
    })
    .select('id')
    .single();

  if (!error && data) return data.id as string;
  if (isUniqueViolation(error)) return null;
  throw new ApiError('INTERNAL', 'Could not add that place to your trip.');
}

/**
 * Find or create the traveler's own `destination_places` row for a canonical
 * place, so it can be filed onto a trip the same way any other catalogue row
 * is.
 *
 * REUSE FIRST, AND ONLY WHEN PROVEN. A traveler who taps "Add to trip" on the
 * same place twice must not accumulate a second row for it — but reuse is
 * only ever a row whose `canonical_place_id` already equals the place being
 * requested. A same-named row that is unlinked, or linked to a DIFFERENT
 * canonical place, is never treated as a match: this function must never
 * return success while having filed a different place than the one asked
 * for, and it must never rewrite an existing row's identity on a guess.
 *
 * WHAT A NEW ROW CARRIES, and what it deliberately does not:
 *   - `created_by` is always the caller — migration 009's insert policy
 *     accepts nothing else.
 *   - name, category and coordinates come from the canonical record, which
 *     has already passed through `canonicalPlaceInput` (lib/places/validation.ts)
 *     at some point in its life — trusted fields, not re-validated here.
 *   - `description` is left empty rather than fabricated: `places` has no
 *     description field to copy, and inventing prose here would be exactly
 *     the kind of invented data CLAUDE.md's data rules forbid.
 *   - `source` is `'ai_generated'` — the existing vocabulary's word for "not
 *     hand-written editorial content" (lib/travel/placeImport.ts uses the same
 *     label for an imported place). There is no third value to reach for.
 *   - Nothing about verification, ownership or provenance is copied from the
 *     canonical row — `createdBy` on `RegistryPlace` is never read here.
 */
async function materializeDestinationPlace(
  supabase: SupabaseClient,
  userId: string,
  place: RegistryPlace
): Promise<string> {
  const reused = await findMaterializedRow(supabase, userId, place.id);
  if (reused) return reused;

  const name = place.name.trim().slice(0, PLACE_NAME_MAX);

  const created = await tryInsertDestinationPlace(supabase, userId, place, name);
  if (created) return created;

  // destination_places_owner_name_idx refused the plain name: the traveler
  // already has a row with this exact (destination, name). Reuse it ONLY when
  // it is provably this same canonical place already — a race where a
  // concurrent request just won and committed it. A NULL link, or a link to a
  // different canonical place, proves nothing about whether the two rows
  // describe the same real-world place, so neither is ever reused and neither
  // is ever mutated to claim an identity this function cannot establish.
  const collision = await findNameCollision(supabase, userId, place.countryName, name);
  if (collision && collision.canonicalPlaceId === place.id) {
    return collision.id;
  }

  // Disambiguate instead: a new row, under a name that cannot collide with the
  // unrelated one, so "add to trip" never silently files the wrong place and
  // never rewrites a row the traveler did not ask to change.
  const disambiguated = await tryInsertDestinationPlace(
    supabase,
    userId,
    place,
    disambiguatedName(name, place.id)
  );
  if (disambiguated) return disambiguated;

  // The disambiguated name collided too — only reachable if a concurrent
  // request for this exact canonical place just won that exact race and
  // committed first. One more reuse check before giving up honestly.
  const afterRace = await findMaterializedRow(supabase, userId, place.id);
  if (afterRace) return afterRace;

  throw new ApiError('INTERNAL', 'Could not add that place to your trip.');
}

/**
 * Whether an EXPLICITLY-NAMED trip is even for the right country.
 *
 * Only needed on that path: `resolveTrip`'s own auto-match branch already
 * guarantees `trip.destination === countryName` by construction (it searches,
 * or creates, by that exact string) — see lib/travel/savedPlaces.ts. A trip
 * the traveler names directly carries no such guarantee.
 *
 * `.eq('id', tripId)` is a primary-key lookup, so `.maybeSingle()` here is
 * provably safe (unlike `findMaterializedRow` above).
 */
async function tripDestinationMatches(
  supabase: SupabaseClient,
  tripId: string,
  countryName: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('trip_plans')
    .select('destination')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not verify that trip.');
  if (!data) return false;
  // Exact match after trim, not case-folded — the same convention
  // lib/travel/savedPlaces.ts's own resolveTrip uses, and for the same
  // reason: destination is free text, and a looser match here would approve a
  // trip that addIdeaToTrip's own destination check would then still refuse.
  return String(data.destination ?? '').trim() === countryName.trim();
}

/**
 * Add a canonical place to a trip's Ideas list.
 *
 * AUTHORIZATION HAPPENS FIRST, AND ONLY ONCE, HERE: `getPlaceById` runs on the
 * caller's own session client, so `places_read_public_or_own` decides whether
 * this place exists for this caller at all. A place invisible to the caller
 * (someone else's private `unverified` guess, or a genuinely nonexistent id)
 * produces NOT_FOUND before anything else runs — the exact same shape
 * `GET /api/travel/places/:id` already uses, so a forged or guessed id cannot
 * be distinguished from one that never existed.
 *
 * TRIP RESOLUTION IS ENTIRELY lib/travel/savedPlaces.ts's — `chosenTrip` for
 * an explicit `tripId` (RLS hides any trip that is not the caller's, so a
 * foreign tripId 404s exactly like an unknown one) or `resolveTrip` to find,
 * disambiguate between, or create one for the place's country. Nothing here
 * re-decides what counts as a matching or ambiguous trip.
 *
 * An explicit `tripId` is additionally checked for destination compatibility
 * BEFORE anything is materialized — a mismatched trip is refused outright
 * rather than left behind as an orphan `destination_places` row (the review's
 * LOW-1: unlike the guide-save path, which resolves a pre-existing catalogue
 * row and creates nothing, this path creates a row, so an unchecked mismatch
 * would leave one dangling even though the write it was for never completes).
 */
export async function addPlaceToTrip(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  tripId?: string
): Promise<AddPlaceToTripResult> {
  const place = await getPlaceById(supabase, placeId);
  if (!place) {
    throw new ApiError('NOT_FOUND', 'We could not find that place.');
  }

  const trip = tripId
    ? await chosenTrip(supabase, tripId)
    : await resolveTrip(supabase, userId, place.countryName);
  if (trip.status === 'ambiguous') {
    return { status: 'needsChoice', candidates: trip.candidates };
  }

  if (tripId && !(await tripDestinationMatches(supabase, trip.id, place.countryName))) {
    throw new ApiError(
      'BAD_REQUEST',
      'That trip is not set up for this place. Choose a trip for the right destination.'
    );
  }

  const destinationPlaceId = await materializeDestinationPlace(supabase, userId, place);

  if (await isAlreadyOnTrip(supabase, trip.id, destinationPlaceId)) {
    return {
      status: 'added',
      tripId: trip.id,
      tripTitle: trip.title,
      createdTrip: trip.created,
      alreadyAdded: true,
    };
  }

  await addIdeaToTrip(supabase, trip.id, destinationPlaceId);

  return {
    status: 'added',
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
    alreadyAdded: false,
  };
}
