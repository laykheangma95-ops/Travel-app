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
import { attachCanonicalPlace, getPlaceById, type RegistryPlace } from './repository';

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
 * Find or create the traveler's own `destination_places` row for a canonical
 * place, so it can be filed onto a trip the same way any other catalogue row
 * is.
 *
 * REUSE FIRST. A traveler who taps "Add to trip" on the same place twice (two
 * different trips, or the same trip after removing it) must not accumulate a
 * second `destination_places` row for it — `canonical_place_id` is exactly the
 * key that makes "the row I already made for this place" a lookup instead of
 * a guess.
 *
 * WHAT THE NEW ROW CARRIES, and what it deliberately does not:
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
  const { data: existing, error: lookupError } = await supabase
    .from('destination_places')
    .select('id')
    .eq('created_by', userId)
    .eq('canonical_place_id', place.id)
    .maybeSingle();
  if (lookupError) throw new ApiError('INTERNAL', 'Could not check your saved places.');
  if (existing) return existing.id as string;

  const name = place.name.trim().slice(0, PLACE_NAME_MAX);

  const { data: inserted, error: insertError } = await supabase
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

  if (!insertError && inserted) return inserted.id as string;

  // destination_places_owner_name_idx — UNIQUE (created_by, destination, name)
  // (migration 009) — refuses a second row with the exact same name for this
  // traveler and destination. That only happens here when the traveler already
  // made an unrelated row with an identical name before ever reaching this
  // canonical place (a manual add, or an older import that never resolved).
  // Their own row, already theirs: reuse it rather than fail the whole action,
  // and link it to this canonical place if nothing else already claims it.
  if (isUniqueViolation(insertError)) {
    const { data: collided, error: collisionError } = await supabase
      .from('destination_places')
      .select('id, canonical_place_id')
      .eq('created_by', userId)
      .eq('destination', place.countryName)
      .eq('name', name)
      .maybeSingle();
    if (collisionError) throw new ApiError('INTERNAL', 'Could not add that place to your trip.');
    if (collided) {
      // Never overwrite a link to a DIFFERENT canonical place — that would be
      // this function silently reassigning a row's identity. Reusing the row
      // as-is (rare: two distinctly-named-alike places for one traveler in one
      // destination) is the smallest safe behaviour; the mismatch is cosmetic,
      // not a security issue, since the row still only ever belongs to them.
      if (!collided.canonical_place_id) {
        await attachCanonicalPlace(supabase, collided.id as string, place.id);
      }
      return collided.id as string;
    }
  }

  throw new ApiError('INTERNAL', 'Could not add that place to your trip.');
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

  // If `tripId` was explicit and its trip's own `destination` does not match
  // `place.countryName` (a traveler picking a trip for the wrong country),
  // `addIdeaToTrip` itself refuses with NOT_FOUND — the same guard it already
  // enforces for the guide-save path (`savePlaceForTraveler` relies on the
  // exact same check rather than a second one here).
  await addIdeaToTrip(supabase, trip.id, destinationPlaceId);

  return {
    status: 'added',
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
    alreadyAdded: false,
  };
}
