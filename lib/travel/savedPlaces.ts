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

/**
 * What a save needs to know.
 *
 * The place's name, description and category are deliberately absent. The
 * seeded catalogue row is the source of truth for all three; accepting them
 * from the caller would invite the belief that editing them has an effect, or
 * let one traveler rename a place for everybody else.
 */
export interface SavePlaceInput {
  /** Country name, matching `trip_plans.destination`. */
  destination: string;
  /**
   * Stable identifier for the guide entry, e.g. "thailand:wat-pho", generated
   * into the catalogue by scripts/csv-to-seed-sql.mjs.
   */
  contentSlug: string;
  /**
   * The trip to save onto, when the traveler has already answered a
   * `needsChoice`. Omitted on a first attempt, which is what lets this function
   * decide — or ask.
   */
  tripId?: string;
}

export type SavePlaceResult =
  | {
      status: 'saved';
      tripId: string;
      tripTitle: string;
      createdTrip: boolean;
      /** True when it was already on this trip, so nothing was written. */
      alreadySaved: boolean;
    }
  | { status: 'needsChoice'; candidates: { id: string; title: string }[] };

interface CatalogueRow {
  id: string;
  category: ItineraryCategory;
  destination: string;
}

/** The catalogue row a slug names, or null when the guide entry is not seeded. */
async function placeBySlug(
  supabase: SupabaseClient,
  contentSlug: string
): Promise<CatalogueRow | null> {
  const { data, error } = await supabase
    .from('destination_places')
    .select('id,category,destination')
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
  // 1. Resolve the catalogue row. This is a read, and only a read. The
  //    catalogue is seeded from guide content by
  //    supabase/seeds/destination_places.sql, so a slug that is not there is a
  //    content problem — a guide entry published without its seed row — and
  //    inventing a row here would paper over it with a place that has no
  //    coordinates and no description.
  const place = await placeBySlug(supabase, input.contentSlug);
  if (!place) {
    throw new ApiError('NOT_FOUND', 'That place is not in our guide yet.');
  }

  // The caller names the country as well as the slug. If the two disagree the
  // guide is pointing at the wrong place, and filing it would put, say, a Tokyo
  // temple on a Thailand trip.
  if (place.destination.trim().toLowerCase() !== input.destination.trim().toLowerCase()) {
    throw new ApiError('BAD_REQUEST', 'That place does not belong to that destination.');
  }

  // 2. Resolve the trip: theirs, this country, not already over. Matching uses
  //    the CATALOGUE's spelling of the country, because that is the string
  //    addIdeaToTrip will compare the place against.
  //
  //    A tripId means the traveler has already answered a needsChoice, so the
  //    question is settled and asking again would be a loop. RLS still decides
  //    whether that trip is theirs to write to.
  const trip = input.tripId
    ? await chosenTrip(supabase, input.tripId)
    : await resolveTrip(supabase, userId, place.destination);
  if (trip.status === 'ambiguous') {
    return { status: 'needsChoice', candidates: trip.candidates };
  }

  // 3. Saving twice is a no-op, not a second copy. A save button on a phone gets
  //    double-tapped, and a traveler who saves a place they saved last week
  //    means "make sure this is on my trip", not "put it there twice".
  if (await isAlreadyOnTrip(supabase, trip.id, place.id)) {
    return {
      status: 'saved',
      tripId: trip.id,
      tripTitle: trip.title,
      createdTrip: trip.created,
      alreadySaved: true,
    };
  }

  await addIdeaToTrip(supabase, trip.id, place.id);

  return {
    status: 'saved',
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
    alreadySaved: false,
  };
}

/** The trip the traveler picked. RLS hides anyone else's, so this 404s. */
async function chosenTrip(supabase: SupabaseClient, tripId: string): Promise<ResolvedTrip> {
  const { data, error } = await supabase
    .from('trip_plans')
    .select('id,title')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load that trip.');
  if (!data) throw new ApiError('NOT_FOUND', 'That trip could not be found.');
  return { status: 'single', id: data.id as string, title: data.title as string, created: false };
}

/**
 * Is this place already anywhere on this trip?
 *
 * Anywhere, not just Ideas: a traveler who has already scheduled this place on
 * day two does not want it reappearing in Ideas as though it were new.
 */
async function isAlreadyOnTrip(
  supabase: SupabaseClient,
  tripId: string,
  placeId: string
): Promise<boolean> {
  const { data: days } = await supabase.from('itinerary_days').select('id').eq('trip_id', tripId);
  const dayIds = (days ?? []).map((day) => day.id as string);
  if (!dayIds.length) return false;

  const { count } = await supabase
    .from('itinerary_places')
    .select('*', { count: 'exact', head: true })
    .eq('place_id', placeId)
    .in('itinerary_day_id', dayIds);
  return (count ?? 0) > 0;
}

type ResolvedTrip =
  | { status: 'single'; id: string; title: string; created: boolean }
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

  // ilike narrows the round trip; the decision is made here, on an EXACT match.
  //
  // Not lower()=lower(), deliberately. `trip_plans.destination` is free text
  // (tripWrites.ts validates length, not vocabulary) so a trip can be stored as
  // "thailand" while the catalogue says "Thailand" — and every other part of the
  // itinerary feature compares destinations exactly: snapshot() loads
  // curatedPlaces with .eq, and so does addPlace. A case-insensitive match here
  // would hand back a trip that addIdeaToTrip then refuses, and whose add-place
  // sheet is empty anyway. Treating it as "no trip for this country" gives the
  // traveler a trip that works, rather than filing a place into one that does
  // not. See the note in the report about validating destination properly.
  const wanted = destination.trim();
  const matches = (data ?? []).filter((row) => String(row.destination ?? '').trim() === wanted);

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
    created: true,
  };
}
