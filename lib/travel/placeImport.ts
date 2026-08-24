// ─────────────────────────────────────────────────────────────────────────────
// Writing imported places onto a trip.
//
// The write half of the importer. app/api/travel/extract answers "what places
// are in this?"; this answers "put these on my trip", once the traveler has
// ticked the ones they want.
//
// WHY IT REUSES addIdeaToTrip:
//   Filing a place into the day_index 0 Ideas list — find-or-create the day,
//   append with the right sort_order — already exists in lib/travel/savedPlaces
//   and is already what the itinerary builder and the destination guides both
//   call. Rule 11: never rebuild what exists. An imported place lands in exactly
//   the same list, in exactly the same shape, as one saved from a guide, so the
//   itinerary editor needs no knowledge that the importer exists at all.
//
// WHY EVERY FUNCTION TAKES `supabase`:
//   These run on the CALLER'S session client. Ownership is deliberately not
//   re-checked here: RLS is what confines a traveler to their own rows —
//   `trips_all_own`, `itinerary_days_owner`, `itinerary_places_owner` and the
//   `destination_places_*` policies. Handing a service_role client to anything
//   in this module would silently switch all of that off, which is rule 3.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/http';
import type { ItineraryCategory } from './itinerary';
import { PLACE_DESCRIPTION_MAX, PLACE_NAME_MAX } from './itinerary';
import { addIdeaToTrip } from './savedPlaces';
import { normalizeTripDraft, suggestTripTitle } from './trips';

/** One place the traveler ticked. Already normalised by placeExtraction. */
export interface ImportablePlace {
  name: string;
  description: string;
  category: ItineraryCategory;
  lat: number | null;
  lng: number | null;
}

/** The most places one import writes. Matches MAX_CANDIDATES on the read side. */
export const MAX_IMPORT_PLACES = 25;

export interface ImportTarget {
  /** An existing trip the traveler picked. RLS decides whether it is theirs. */
  tripId?: string;
  /** The country to file under, and to start a trip for when there is none. */
  destination: string;
  /** A title for a trip created here. Falls back to the usual suggestion. */
  title?: string;
  /**
   * True when the traveler explicitly asked for a new trip — the "New" button
   * in the review sheet — even though one already exists for this country.
   * Without it, an existing open trip is reused.
   */
  forceNew?: boolean;
}

export interface ImportResult {
  tripId: string;
  tripTitle: string;
  createdTrip: boolean;
  /** Names that were written, in the order they were given. */
  added: string[];
  /** Names already on this trip. Not an error — a second import of one post. */
  skipped: string[];
  /** Names that could not be written. Reported, never swallowed. */
  failed: string[];
}

/**
 * File a batch of imported places onto one trip, creating the trip if needed.
 *
 * Partial success is a real outcome and is reported as one. Eight places saved
 * and one failed is eight places the traveler has; failing the whole batch to
 * keep the write atomic would be the worse trade, because they would have to
 * re-import and re-tick everything to get back to where they already were.
 */
export async function importPlacesToTrip(
  supabase: SupabaseClient,
  userId: string,
  places: ImportablePlace[],
  target: ImportTarget
): Promise<ImportResult> {
  if (places.length === 0) throw new ApiError('BAD_REQUEST', 'Pick at least one place to save.');
  if (places.length > MAX_IMPORT_PLACES) {
    throw new ApiError('BAD_REQUEST', 'That is more places than one import can save.');
  }

  const trip = target.tripId
    ? await existingTrip(supabase, target.tripId)
    : await tripForDestination(supabase, userId, target);

  // Everything is filed under the TRIP's spelling of the country, not the
  // caller's. addIdeaToTrip matches a place against `trip.destination` exactly,
  // so a place inserted as "thailand" onto a trip stored as "Thailand" would be
  // written and then refused — a row in the catalogue that reaches no list.
  const destination = trip.destination;

  const existingNames = await namesAlreadyOnTrip(supabase, trip.id);

  const added: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const place of places) {
    const name = place.name.trim().slice(0, PLACE_NAME_MAX);
    if (!name) continue;

    if (existingNames.has(fold(name))) {
      skipped.push(name);
      continue;
    }

    try {
      const placeId = await insertPlace(supabase, userId, destination, { ...place, name });
      await addIdeaToTrip(supabase, trip.id, placeId);
      existingNames.add(fold(name));
      added.push(name);
    } catch {
      // One bad row must not cost the traveler the other eight.
      failed.push(name);
    }
  }

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
    added,
    skipped,
    failed,
  };
}

interface ResolvedTrip {
  id: string;
  title: string;
  destination: string;
  created: boolean;
}

/** The trip the traveler picked. RLS hides anyone else's, so this 404s. */
async function existingTrip(supabase: SupabaseClient, tripId: string): Promise<ResolvedTrip> {
  const { data, error } = await supabase
    .from('trip_plans')
    .select('id,title,destination')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load that trip.');
  if (!data) {
    throw new ApiError('NOT_FOUND', 'That trip is no longer available. Please choose another.');
  }
  return {
    id: data.id as string,
    title: data.title as string,
    destination: data.destination as string,
    created: false,
  };
}

/**
 * The traveler's open trip for this country, or a new one.
 *
 * Deliberately simpler than savedPlaces.resolveTrip, which returns a
 * `needsChoice` when several trips match. The importer's UI has already shown
 * the traveler their trips and let them pick one — a `tripId` is present in
 * that case — so reaching here means "I did not pick, just put it somewhere
 * sensible", and the most recently created open trip is that somewhere.
 */
async function tripForDestination(
  supabase: SupabaseClient,
  userId: string,
  target: ImportTarget
): Promise<ResolvedTrip> {
  const destination = target.destination.trim();
  if (!destination) throw new ApiError('BAD_REQUEST', 'Choose where this trip is to.');

  if (!target.forceNew) {
    // A trip with no end date is a wish and always still open; one that ended
    // before today is history and is not somewhere to file a new idea.
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('trip_plans')
      .select('id,title,destination,end_date,created_at')
      .eq('user_id', userId)
      .ilike('destination', destination)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('created_at', { ascending: false });
    if (error) throw new ApiError('INTERNAL', 'Could not load your trips.');

    // ilike narrows the round trip; the decision is made on an EXACT match, for
    // the reason spelled out in savedPlaces.resolveTrip — a case-insensitive
    // match hands back a trip that addIdeaToTrip then refuses.
    const match = (data ?? []).find(
      (row) => String(row.destination ?? '').trim() === destination
    );
    if (match) {
      return {
        id: match.id as string,
        title: match.title as string,
        destination: match.destination as string,
        created: false,
      };
    }
  }

  // Same column shape the "New trip" form writes through
  // app/api/travel/trips/route.ts, so an auto-created trip is not a second
  // dialect of the same row. `is_wishlist` marks it as one nobody filled in a
  // form for (migration 011).
  const title = (target.title?.trim() || suggestTripTitle(destination, 'en')).slice(0, 80);
  const columns = normalizeTripDraft({
    title,
    destination,
    startDate: null,
    endDate: null,
    travelers: 1,
    interests: [],
  });
  const { data: created, error } = await supabase
    .from('trip_plans')
    .insert({ user_id: userId, ...columns, is_wishlist: true })
    .select('id,title,destination')
    .single();
  if (error || !created) throw new ApiError('INTERNAL', 'Could not start a trip for these places.');

  return {
    id: created.id as string,
    title: (created.title as string) ?? title,
    destination: (created.destination as string) ?? destination,
    created: true,
  };
}

/**
 * A traveler's own catalogue row for an imported place.
 *
 * `created_by` is the caller's id, so migration 009's policies scope it to
 * them: nobody else can read it, and it can never be mistaken for part of the
 * editorial catalogue. `source` is 'ai_generated' — the schema's own word for
 * "not hand-written by us", and the honest label for a name read out of
 * somebody's caption.
 */
async function insertPlace(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  place: ImportablePlace
): Promise<string> {
  const { data, error } = await supabase
    .from('destination_places')
    .insert({
      destination,
      name: place.name,
      category: place.category,
      // A place with no coordinates simply does not get a map pin, exactly as
      // in the manual add-place form. Refusing to import it would be the wrong
      // trade: the name and the note are most of the value.
      lat: place.lat ?? 0,
      lng: place.lng ?? 0,
      description: place.description.slice(0, PLACE_DESCRIPTION_MAX),
      source: 'ai_generated',
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) throw new ApiError('INTERNAL', 'Could not save that place.');
  return data.id as string;
}

/** Case- and punctuation-insensitive, so "Wat Pho" and "wat pho." are one place. */
function fold(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Every place name already anywhere on this trip.
 *
 * Anywhere, not just Ideas: a traveler who scheduled this cafe on day two does
 * not want importing the post again to put a second copy in Ideas. Names rather
 * than ids, because an imported place is a fresh catalogue row every time and
 * so can never match by id.
 */
async function namesAlreadyOnTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<Set<string>> {
  const { data: days } = await supabase.from('itinerary_days').select('id').eq('trip_id', tripId);
  const dayIds = (days ?? []).map((day) => day.id as string);
  if (!dayIds.length) return new Set();

  const { data: rows } = await supabase
    .from('itinerary_places')
    .select('place:destination_places(name)')
    .in('itinerary_day_id', dayIds);

  const names = new Set<string>();
  for (const row of rows ?? []) {
    // Supabase types an embedded row as an array on some join shapes and an
    // object on others; both are handled rather than cast away.
    const place = (row as { place?: unknown }).place;
    const entries = Array.isArray(place) ? place : [place];
    for (const entry of entries) {
      const name = (entry as { name?: unknown } | null)?.name;
      if (typeof name === 'string') names.add(fold(name));
    }
  }
  return names;
}
