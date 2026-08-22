// ─────────────────────────────────────────────────────────────────────────────
// Saving a place — the server side of "I want to keep that".
//
// Two functions:
//
//   addIdeaToTrip()        the find-or-create-Ideas-day insert that has lived
//                          inline in the itinerary PATCH route since it was
//                          written. Lifted here unchanged so a second caller
//                          can reuse it rather than grow a second copy that
//                          drifts (§2 rule 11).
//
//   savePlaceForTraveler() composes it: resolve the place, resolve the trip,
//                          drop the place into that trip's Ideas list.
//
// Both take the CALLER'S session client. Neither reaches for the service role:
// RLS on trip_plans (`trips_all_own`), destination_places (migration 009) and
// itinerary_places (migration 007) is what confines a traveler to their own
// rows, and nothing here is allowed to step around it (§2 rules 3 and 4).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/http';
import type { ItineraryCategory } from '@/lib/travel/itinerary';
import { normalizeTripDraft, suggestTripTitle, type TripDraft } from '@/lib/travel/trips';

/**
 * Put an existing place into a trip's Ideas list — day_index 0, the private
 * unscheduled holding area migration 007 defines.
 *
 * `destination` is required, not incidental: the original inline code scoped the
 * place lookup to the trip's destination, so a place id belonging to a different
 * country could never be attached. Dropping that would have widened what the
 * route accepts, so it is carried through instead.
 *
 * Returns the new itinerary_places id.
 */
export async function addIdeaToTrip(
  supabase: SupabaseClient,
  input: { tripId: string; destination: string; placeId: string }
): Promise<string> {
  let { data: ideasDay } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('trip_id', input.tripId)
    .eq('day_index', 0)
    .maybeSingle();

  if (!ideasDay) {
    const { data, error } = await supabase
      .from('itinerary_days')
      .insert({ trip_id: input.tripId, day_index: 0, date: null })
      .select('id')
      .single();
    if (error || !data) throw new ApiError('INTERNAL', 'Could not prepare your Ideas list.');
    ideasDay = data;
  }

  const { data: place } = await supabase
    .from('destination_places')
    .select('id,category')
    .eq('id', input.placeId)
    .eq('destination', input.destination)
    .maybeSingle();
  if (!place) throw new ApiError('NOT_FOUND', 'That place could not be found.');

  const { count } = await supabase
    .from('itinerary_places')
    .select('*', { count: 'exact', head: true })
    .eq('itinerary_day_id', ideasDay.id);

  const { data: inserted, error } = await supabase
    .from('itinerary_places')
    .insert({
      itinerary_day_id: ideasDay.id,
      place_id: place.id,
      category: place.category as ItineraryCategory,
      sort_order: count ?? 0,
    })
    .select('id')
    .single();
  if (error || !inserted) throw new ApiError('INTERNAL', 'Could not add that idea.');

  return inserted.id as string;
}

export interface SavePlaceInput {
  /** Country name, matched against trip_plans.destination. */
  destination: string;
  /** Stable key for the guide entry, e.g. "bangkok:wat-pho". */
  contentSlug: string;
  name: string;
  description: string;
  category: ItineraryCategory;
}

export type SavePlaceResult =
  | { status: 'saved'; tripId: string; tripTitle: string; createdTrip: boolean }
  | { status: 'needsChoice'; candidates: { id: string; title: string }[] };

/** `%` and `_` are wildcards to ilike. A destination is a literal, so neuter them. */
function literal(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Save one guide place for one traveler, creating the trip to hold it if there
 * is not already an obvious one.
 *
 * Ambiguity is never resolved by guessing: two open trips to the same country is
 * a question for the traveler, and in that branch this function reads only — it
 * writes nothing at all.
 */
export async function savePlaceForTraveler(
  supabase: SupabaseClient,
  userId: string,
  input: SavePlaceInput
): Promise<SavePlaceResult> {
  const destination = input.destination.trim();

  // ── 1. The place ───────────────────────────────────────────────────────────
  // created_by is the caller, because migration 009's insert policy is
  // WITH CHECK (created_by = auth.uid()) — an editorial row cannot be written
  // through a session client, and widening that policy would hand every signed-in
  // traveler write access to the shared catalogue.
  const { data: existingPlace } = await supabase
    .from('destination_places')
    .select('id')
    .eq('created_by', userId)
    .eq('content_slug', input.contentSlug)
    .maybeSingle();

  let placeId = existingPlace?.id as string | undefined;

  if (!placeId) {
    // ignoreDuplicates makes a concurrent second save a no-op against the
    // (created_by, content_slug) index from migration 011 rather than an error.
    // It also returns no row when it skips, hence the re-select below.
    const { data: created, error: createError } = await supabase
      .from('destination_places')
      .upsert(
        {
          destination,
          name: input.name,
          category: input.category,
          // No coordinates: a guide place carries none, and the itinerary
          // treats 0,0 as "no pin" rather than a point off West Africa.
          lat: 0,
          lng: 0,
          description: input.description,
          source: 'editorial',
          created_by: userId,
          content_slug: input.contentSlug,
        },
        { onConflict: 'created_by,content_slug', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();

    if (createError) throw new ApiError('INTERNAL', 'Could not save that place.');

    if (created?.id) {
      placeId = created.id as string;
    } else {
      const { data: raced } = await supabase
        .from('destination_places')
        .select('id')
        .eq('created_by', userId)
        .eq('content_slug', input.contentSlug)
        .maybeSingle();
      if (!raced?.id) throw new ApiError('INTERNAL', 'Could not save that place.');
      placeId = raced.id as string;
    }
  }

  // ── 2. The trip ────────────────────────────────────────────────────────────
  // Anything not already finished: undated trips are wishes, and a wish is still
  // ahead of you — the same rule TripsView applies when it buckets the list.
  const today = new Date().toISOString().slice(0, 10);
  const { data: openTrips, error: tripsError } = await supabase
    .from('trip_plans')
    .select('id,title')
    .eq('user_id', userId)
    .ilike('destination', literal(destination))
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('created_at', { ascending: true });

  if (tripsError) throw new ApiError('INTERNAL', 'Could not check your trips.');

  const candidates = (openTrips ?? []) as { id: string; title: string }[];

  if (candidates.length > 1) {
    return { status: 'needsChoice', candidates };
  }

  let tripId = candidates[0]?.id;
  let tripTitle = candidates[0]?.title;
  const createdTrip = candidates.length === 0;

  if (createdTrip) {
    // Shaped by the same normalizer POST /api/travel/trips uses, so a trip born
    // from a save is indistinguishable from a typed one apart from is_wishlist.
    const draft: TripDraft = {
      title: suggestTripTitle(destination, 'en'),
      destination,
      startDate: null,
      endDate: null,
      travelers: 1,
      interests: [],
    };
    const { data: newTrip, error: createTripError } = await supabase
      .from('trip_plans')
      .insert({ user_id: userId, ...normalizeTripDraft(draft), is_wishlist: true })
      .select('id,title')
      .single();
    if (createTripError || !newTrip) {
      throw new ApiError('INTERNAL', 'Could not start a trip for that place.');
    }
    tripId = newTrip.id as string;
    tripTitle = newTrip.title as string;
  }

  // ── 3. The idea ────────────────────────────────────────────────────────────
  await addIdeaToTrip(supabase, { tripId: tripId!, destination, placeId });

  return { status: 'saved', tripId: tripId!, tripTitle: tripTitle!, createdTrip };
}
