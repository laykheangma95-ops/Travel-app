// ─────────────────────────────────────────────────────────────────────────────
// Filing a place onto a trip.
//
// WHY THIS EXISTS:
//   "Add to Ideas" — find-or-create the day_index 0 holding area, then file a
//   catalogue row into it — was written inline in the itinerary PATCH handler,
//   and so was reachable only from the itinerary builder. Saving a place from a
//   destination guide needs those identical steps from a different entry point.
//   The logic moves here rather than being written a second time (rule 9:
//   business logic lives in lib/; rule 11: never rebuild what exists).
//
// WHY EVERY FUNCTION TAKES `supabase`:
//   These run on the CALLER'S session client. Ownership is deliberately not
//   re-checked in this module: RLS is what confines a traveler to their own
//   rows — `trips_all_own` (schema.sql), `itinerary_days_owner` and
//   `itinerary_places_owner` (migration 007), and the `destination_places_*`
//   policies (migration 009). Handing a service_role client to anything here
//   would silently switch all of that off, which is rule 3.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/http';
import type { ItineraryCategory } from '@/lib/travel/itinerary';
import { normalizeTripDraft, suggestTripTitle } from '@/lib/travel/trips';

/**
 * File a catalogue place into a trip's unscheduled Ideas list, creating that
 * list on first use. Returns the new `itinerary_places` id.
 *
 * Extracted verbatim from the `addIdea` branch of
 * app/api/travel/itinerary/[tripId]/route.ts — same queries, same order, same
 * ApiError codes and messages. The one addition is reading the trip's
 * destination here: the PATCH handler already had that string in hand, and the
 * guard that a place must belong to the trip's destination is part of the
 * behaviour being preserved, so the function fetches what it needs rather than
 * dropping the check or growing a fourth parameter.
 */
export async function addIdeaToTrip(
  supabase: SupabaseClient,
  tripId: string,
  placeId: string
): Promise<string> {
  const { data: trip } = await supabase
    .from('trip_plans')
    .select('id,destination')
    .eq('id', tripId)
    .maybeSingle();
  if (!trip) throw new ApiError('NOT_FOUND', 'That trip could not be found.');

  let { data: ideasDay } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('trip_id', tripId)
    .eq('day_index', 0)
    .maybeSingle();
  if (!ideasDay) {
    const { data, error } = await supabase
      .from('itinerary_days')
      .insert({ trip_id: tripId, day_index: 0, date: null })
      .select('id')
      .single();
    if (error || !data) throw new ApiError('INTERNAL', 'Could not prepare your Ideas list.');
    ideasDay = data;
  }

  const { data: place } = await supabase
    .from('destination_places')
    .select('id,category')
    .eq('id', placeId)
    .eq('destination', trip.destination)
    .maybeSingle();
  if (!place) throw new ApiError('NOT_FOUND', 'That place could not be found.');

  const { count } = await supabase
    .from('itinerary_places')
    .select('*', { count: 'exact', head: true })
    .eq('itinerary_day_id', ideasDay.id);

  const { data: added, error } = await supabase
    .from('itinerary_places')
    .insert({
      itinerary_day_id: ideasDay.id,
      place_id: place.id,
      category: place.category as ItineraryCategory,
      sort_order: count ?? 0,
    })
    .select('id')
    .single();
  if (error || !added) throw new ApiError('INTERNAL', 'Could not add that idea.');

  return added.id as string;
}

export interface SavePlaceInput {
  /** Country name, matching `trip_plans.destination`. */
  destination: string;
  /** Stable identifier for the guide entry, e.g. "bangkok:wat-pho". */
  contentSlug: string;
  name: string;
  /** May be empty — a guide entry is not required to carry prose. */
  description: string;
  category: ItineraryCategory;
}

export type SavePlaceResult =
  | { status: 'saved'; tripId: string; tripTitle: string; createdTrip: boolean }
  | { status: 'needsChoice'; candidates: { id: string; title: string }[] };

interface CatalogueRow {
  id: string;
  category: ItineraryCategory;
}

/** The catalogue row a slug names, or null the first time it is ever saved. */
async function placeBySlug(
  supabase: SupabaseClient,
  contentSlug: string
): Promise<CatalogueRow | null> {
  const { data, error } = await supabase
    .from('destination_places')
    .select('id,category')
    .eq('content_slug', contentSlug)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not look up that place.');
  return (data as CatalogueRow | null) ?? null;
}

/**
 * Save a place from a destination guide onto the traveler's trip for that
 * country, creating the trip if they do not have one yet.
 *
 * Returns `needsChoice` — writing nothing at all — when the answer to "which
 * trip?" is genuinely ambiguous. Picking one for them would file the place
 * somewhere they have to go and find it, so the caller asks instead.
 */
export async function savePlaceForTraveler(
  supabase: SupabaseClient,
  userId: string,
  input: SavePlaceInput
): Promise<SavePlaceResult> {
  // 1. Resolve the catalogue row. Read only, for now: if the trip turns out to
  //    be ambiguous this function must leave no trace, so the INSERT that backs
  //    a first-ever save is deferred until we know the save will complete.
  const existingPlace = await placeBySlug(supabase, input.contentSlug);

  // 2. Resolve the trip: theirs, this country, not already over.
  const trip = await resolveTrip(supabase, userId, input.destination);
  if (trip.status === 'ambiguous') {
    return { status: 'needsChoice', candidates: trip.candidates };
  }

  // 3. A single trip — existing or just created. Now the writes can happen.
  //    The catalogue row is stamped with the TRIP'S destination string, not the
  //    caller's: addIdeaToTrip matches the two exactly, so a trip stored as
  //    "thailand" and an input of "Thailand" would otherwise create a place the
  //    trip is not allowed to hold.
  const place = existingPlace ?? (await createPlace(supabase, input, trip.destination));
  await addIdeaToTrip(supabase, trip.id, place.id);

  return {
    status: 'saved',
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
  };
}

type ResolvedTrip =
  | { status: 'single'; id: string; title: string; destination: string; created: boolean }
  | { status: 'ambiguous'; candidates: { id: string; title: string }[] };

async function resolveTrip(
  supabase: SupabaseClient,
  userId: string,
  destination: string
): Promise<ResolvedTrip> {
  // A trip with no end date is a wish and always still open; one that ended
  // before today is history and is not somewhere to save a new idea.
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('trip_plans')
    .select('id,title,destination,end_date')
    .eq('user_id', userId)
    .ilike('destination', destination)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) throw new ApiError('INTERNAL', 'Could not load your trips.');

  // ilike treats `_` and `%` as wildcards, so the exact lower()=lower() match
  // the caller asked for is settled here rather than left to the pattern.
  const wanted = destination.trim().toLowerCase();
  const matches = (data ?? []).filter(
    (row) => String(row.destination ?? '').trim().toLowerCase() === wanted
  );

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      candidates: matches.map((row) => ({ id: row.id as string, title: row.title as string })),
    };
  }

  if (matches.length === 1) {
    return {
      status: 'single',
      id: matches[0].id as string,
      title: matches[0].title as string,
      destination: matches[0].destination as string,
      created: false,
    };
  }

  // Same column shape the "New trip" form writes through
  // app/api/travel/trips/route.ts, so an auto-created trip is not a second
  // dialect of the same row. `is_wishlist` is the only thing that marks it
  // apart: nobody filled in a form for this one (migration 011).
  const title = suggestTripTitle(destination, 'en');
  const columns = normalizeTripDraft({
    title,
    destination,
    startDate: null,
    endDate: null,
    travelers: 1,
    interests: [],
  });
  const { data: created, error: createError } = await supabase
    .from('trip_plans')
    .insert({ user_id: userId, ...columns, is_wishlist: true })
    .select('id,title')
    .single();
  if (createError || !created) {
    throw new ApiError('INTERNAL', 'Could not start a trip for that place.');
  }

  return {
    status: 'single',
    id: created.id as string,
    title: (created.title as string) ?? title,
    destination: columns.destination,
    created: true,
  };
}

async function createPlace(
  supabase: SupabaseClient,
  input: SavePlaceInput,
  destination: string
): Promise<CatalogueRow> {
  // INSERT ... ON CONFLICT (content_slug) DO NOTHING, then re-select. Two
  // travelers tapping save on the same guide entry at the same moment must land
  // on one catalogue row; migration 011's partial unique index is what decides
  // that, not a check-then-insert race in here.
  const { error } = await supabase.from('destination_places').upsert(
    {
      destination,
      name: input.name,
      category: input.category,
      // A place with no coordinates simply does not get a map pin — the same
      // trade the addCustom branch of the itinerary route already makes.
      lat: 0,
      lng: 0,
      description: input.description,
      source: 'editorial',
      created_by: null,
      content_slug: input.contentSlug,
    },
    { onConflict: 'content_slug', ignoreDuplicates: true }
  );
  if (error) throw new ApiError('INTERNAL', 'Could not save that place.');

  const place = await placeBySlug(supabase, input.contentSlug);
  if (!place) throw new ApiError('INTERNAL', 'Could not save that place.');
  return place;
}
