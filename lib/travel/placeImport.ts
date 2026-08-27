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
import { log } from '@/lib/logger';
import { attachCanonicalPlace, resolvePlaceForTraveler, type RegistryPlace } from '@/lib/places/repository';
import type { CanonicalPlaceInput } from '@/lib/places/validation';
import type { PinOrigin } from '@/lib/places/resolutionConfidence';
import type { ItineraryCategory } from './itinerary';
import { PLACE_DESCRIPTION_MAX, PLACE_NAME_MAX } from './itinerary';
import { addIdeaToTrip } from './savedPlaces';
import { loadImportProvenance, markCandidateAccepted, recordPlaceSource } from './importJobs';
import { normalizeTripDraft, suggestTripTitle } from './trips';

/** One place the traveler ticked. Already normalised by placeExtraction. */
export interface ImportablePlace {
  name: string;
  description: string;
  category: ItineraryCategory;
  lat: number | null;
  lng: number | null;
  /** Phase 13 resolution-confidence evidence, echoed from the review screen.
   *  See app/api/travel/places/import/route.ts's `place` schema — never
   *  trusted as fact, only ever weighed by lib/places/repository.ts. */
  pinSource?: 'maps-link' | 'model' | 'caption' | null;
  geocodeResultCount?: number | null;
  geocodeCountryMismatch?: boolean | null;
}

/** A canonical place stripped to what a confirmation screen needs — never
 *  `createdBy`, never `verificationStatus`/`verifiedAt`: those are internal
 *  registry/ownership metadata, not something a traveler picking between two
 *  cafés needs to see. */
export interface ResolutionCandidateSummary {
  id: string;
  name: string;
  localName: string | null;
  address: string | null;
  city: string | null;
  countryName: string;
  latitude: number;
  longitude: number;
  category: string;
  /** Distance from the traveler's own saved place, in metres. */
  meters: number;
}

function toCandidateSummary(place: RegistryPlace, meters: number): ResolutionCandidateSummary {
  return {
    id: place.id,
    name: place.name,
    localName: place.localName,
    address: place.address,
    city: place.city,
    countryName: place.countryName,
    latitude: place.latitude,
    longitude: place.longitude,
    category: place.category,
    meters,
  };
}

/** What the traveler sees about a place's canonical-resolution outcome.
 *  Present only when there is something to show or ask — a place that never
 *  resolved (no coordinates, a registry miss) carries no `resolution` at
 *  all, exactly as before Phase 13. */
export interface PlaceResolutionSummary {
  decision: 'auto' | 'ambiguous';
  confidence: number;
  resolverVersion: string;
  /** The top match. Already attached when `decision === 'auto'`; a proposal
   *  awaiting confirmation when `decision === 'ambiguous'`. */
  proposed: ResolutionCandidateSummary;
  /** Only populated when `decision === 'ambiguous'`. */
  alternatives: ResolutionCandidateSummary[];
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
  /** Names that were written, in the order they were given. Derived from `addedPlaces` — kept for existing callers. */
  added: string[];
  /** Names already on this trip. Not an error — a second import of one post. */
  skipped: string[];
  /** Names that could not be written. Reported, never swallowed. */
  failed: string[];
  /**
   * The canonical registry id (migration 013) for the one place this import
   * added, when there was exactly one and it resolved. Null for a multi-place
   * import — there is no single place left to point a "View place" link at —
   * and null whenever the place didn't resolve (no coordinates, a registry
   * miss, a race lost to another traveler). Kept for existing callers; derived
   * from `addedPlaces` the same way `added` is.
   */
  canonicalPlaceId: string | null;
  /**
   * Phase 12. One entry per place actually written, in the same order as
   * `added` — the single source both are derived from, so a name and its
   * canonical id can never drift apart the way two parallel arrays could.
   * Lets the "saved" screen offer a View-place link and a library heart for
   * EVERY resolved place in a multi-place import, not only when exactly one
   * place was added.
   */
  addedPlaces: AddedPlace[];
}

export interface AddedPlace {
  name: string;
  /** The traveler's own `destination_places` row — always present, always
   *  written, whatever happens to canonical resolution. This is what the
   *  Phase 13 confirmation route (`POST /api/travel/destination-places/:id/resolution`)
   *  is keyed on. */
  destinationPlaceId: string;
  /** Non-null only when resolution already attached a canonical place
   *  (`resolution?.decision === 'auto'`, or absent). Null while a proposal is
   *  awaiting confirmation, and null when nothing resolved at all. */
  canonicalPlaceId: string | null;
  /** Absent when there was nothing to resolve (no coordinates) or nothing
   *  matched closely enough to be worth asking about. */
  resolution?: PlaceResolutionSummary;
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
  target: ImportTarget,
  /**
   * The extraction this save came from, when the client has one. Everything
   * about it is optional and best-effort: provenance is valuable, and never
   * worth failing a save for.
   */
  options: { importId?: string } = {}
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

  // Read once, outside the loop. Null when there is no import id, the id is not
  // this traveler's, or the import was a text paste with no link to credit.
  const provenance = options.importId
    ? await loadImportProvenance(supabase, options.importId)
    : null;

  // The single source of truth for what was actually written. `added` (below)
  // is derived from it rather than kept as a second, parallel array — one
  // `.push()` per successful write means a name and its canonical id can never
  // land at different indexes the way two arrays filled by two statements
  // could drift.
  const addedPlaces: AddedPlace[] = [];
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
      // Looked up BEFORE the write so an ambiguous proposal can carry its
      // extraction provenance from the moment it is recorded, rather than
      // being back-filled by a later lookup that might find nothing.
      const importCandidateId = await candidateIdFor(supabase, options.importId ?? null, name);

      const { placeId, canonicalPlaceId, resolution } = await insertPlace(
        supabase,
        userId,
        destination,
        { ...place, name },
        { importId: options.importId ?? null, importCandidateId }
      );
      await addIdeaToTrip(supabase, trip.id, placeId);

      // Provenance and the accepted-candidate mark. Both are ledger writes and
      // both swallow their own failures — the place is already saved, and a
      // bookkeeping error must not turn a successful save into a failed one.
      if (provenance) {
        await recordPlaceSource(supabase, {
          placeId,
          userId,
          importId: options.importId ?? null,
          platform: provenance.platform,
          key: provenance.key,
        });
      }
      if (options.importId) {
        await markCandidateAccepted(supabase, options.importId, name, placeId);
      }
      existingNames.add(fold(name));
      addedPlaces.push({ name, destinationPlaceId: placeId, canonicalPlaceId, ...(resolution ? { resolution } : {}) });
    } catch {
      // One bad row must not cost the traveler the other eight.
      failed.push(name);
    }
  }

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
    added: addedPlaces.map((entry) => entry.name),
    skipped,
    failed,
    // Only meaningful for "I imported one place" — the common single-link
    // paste. A multi-place import has no single place a "View place" link
    // could point at, so this stays null rather than picking one arbitrarily.
    // `addedPlaces` (below) carries every place's own id regardless of count.
    canonicalPlaceId: addedPlaces.length === 1 ? addedPlaces[0].canonicalPlaceId : null,
    addedPlaces,
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
  place: ImportablePlace,
  provenance: { importId: string | null; importCandidateId: string | null }
): Promise<{ placeId: string; canonicalPlaceId: string | null; resolution: PlaceResolutionSummary | undefined }> {
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
  const placeId = data.id as string;

  // Registry linking reads `place.lat`/`place.lng` BEFORE the `?? 0` fallback
  // above — that fallback is a "no map pin" placeholder for destination_places,
  // never a location, and (0, 0) sent into a 150m proximity search would
  // silently merge every coordinate-less import from every traveler into one
  // row at null island. A place with no real coordinates is left unlinked.
  const linked =
    place.lat !== null && place.lng !== null
      ? await linkCanonicalPlace(
          supabase,
          userId,
          placeId,
          destination,
          { ...place, lat: place.lat, lng: place.lng },
          provenance
        )
      : { canonicalPlaceId: null, resolution: undefined };

  return { placeId, canonicalPlaceId: linked.canonicalPlaceId, resolution: linked.resolution };
}

/**
 * Resolve the imported place against the shared canonical registry
 * (migration 013) and point this traveler's row at it, best-effort.
 *
 * WHY THIS CAN NEVER FAIL THE SAVE: `place` is already written to
 * `destination_places` by the time this runs. `resolvePlaceForTraveler` and
 * `attachCanonicalPlace` already swallow their own Supabase errors and return
 * null/false rather than throw, but this is wrapped anyway — the same "belt
 * and braces" reasoning `recordPlaceSource`/`markCandidateAccepted` already
 * use below, for the same reason: a bookkeeping/linking step must not turn a
 * successful save into a failed one.
 *
 * WHY THE CALLER'S SESSION CLIENT: resolution must only ever see places this
 * traveler's own RLS already permits (published, or their own unverified
 * rows), and anything it creates must land as `unverified` — the ceiling RLS
 * enforces on that client and nothing here overrides.
 */
/**
 * Phase 13: `resolvePlaceForTraveler` no longer means "attach whatever it
 * found". `decision === 'ambiguous'` returns a proposal that must NOT be
 * attached — `canonical_place_id` stays null, exactly like an unresolved
 * place, and the caller gets a `resolution` summary to show the traveler
 * instead. Only `decision === 'auto'` (a confident match, or a freshly
 * created row) is attached here.
 */
async function linkCanonicalPlace(
  supabase: SupabaseClient,
  userId: string,
  destinationPlaceId: string,
  destination: string,
  place: ImportablePlace & { lat: number; lng: number },
  provenance: { importId: string | null; importCandidateId: string | null }
): Promise<{ canonicalPlaceId: string | null; resolution: PlaceResolutionSummary | undefined }> {
  try {
    const input: CanonicalPlaceInput = {
      name: place.name,
      countryName: destination,
      category: place.category,
      latitude: place.lat,
      longitude: place.lng,
    };
    // The model/caption pipeline never produces its own coordinates
    // (lib/travel/placeAgent.ts's schema has none) — a pin on one of those
    // candidates always came from the geocoder. A maps-link candidate's pin
    // is the platform's own exact location.
    const pinOrigin: PinOrigin =
      place.pinSource === 'maps-link' ? 'maps-link' : place.pinSource ? 'geocoder' : 'unknown';

    const resolution = await resolvePlaceForTraveler(supabase, userId, input, {
      pinOrigin,
      geocoderResultCount: place.geocodeResultCount ?? null,
      geocoderCountryMismatch: place.geocodeCountryMismatch ?? null,
    });
    if (!resolution) return { canonicalPlaceId: null, resolution: undefined };

    if (resolution.decision === 'auto') {
      // The returned id must mean "this row is actually linked", not "a
      // resolution merely happened" — a failed write here must not make
      // ImportResult.canonicalPlaceId claim a link destination_places itself
      // does not have.
      const attached = await attachCanonicalPlace(supabase, destinationPlaceId, resolution.place.id);
      return {
        canonicalPlaceId: attached ? resolution.place.id : null,
        resolution: undefined,
      };
    }

    if (resolution.decision === 'ambiguous') {
      // ── The proposal is RECORDED before it is shown ───────────────────────
      //
      // The Phase 13 review proved what happens when it is not: the confirm
      // route re-derived the proposal from the destination_places row, could
      // not see how the pin had been obtained, scored it 1.25x higher without
      // the geocoder penalty, and answered "no-proposal" to a card the
      // traveler was looking at.
      //
      // So the ambiguous proposal becomes a `pending` row here, and the
      // DATABASE computes its confidence and signals (migration 017's
      // create_place_resolution_proposal). What the screen renders below is
      // read back out of that row, so the number shown and the number stored
      // are not two computations that have to agree — they are one value.
      const recorded = await recordProposal(supabase, {
        destinationPlaceId,
        proposedPlaceId: resolution.place.id,
        alternativePlaceIds: resolution.alternatives.map((a) => a.place.id),
        pinOrigin,
        geocoderResultCount: place.geocodeResultCount ?? null,
        geocoderCountryMismatch: place.geocodeCountryMismatch ?? null,
        importId: provenance.importId,
        importCandidateId: provenance.importCandidateId,
      });

      // A proposal that could not be recorded is not shown. Asking a question
      // whose answer has nowhere to land would put the traveler back in
      // exactly the dead-button state this remediation exists to remove.
      if (!recorded) return { canonicalPlaceId: null, resolution: undefined };

      return {
        canonicalPlaceId: null,
        resolution: {
          decision: 'ambiguous',
          confidence: recorded.confidence,
          resolverVersion: recorded.resolverVersion,
          proposed: toCandidateSummary(resolution.place, recorded.distanceMeters),
          alternatives: resolution.alternatives.map((a) => toCandidateSummary(a.place, a.meters)),
        },
      };
    }

    // 'none' — not enough evidence to link OR to ask. Behaves exactly like an
    // unresolved place.
    return { canonicalPlaceId: null, resolution: undefined };
  } catch (cause) {
    log.warn('place_import.registry_link_failed', {
      reason: cause instanceof Error ? cause.message.slice(0, 160) : 'unknown',
    });
    return { canonicalPlaceId: null, resolution: undefined };
  }
}

/**
 * Write the `pending` proposal, and read back the evidence the database
 * derived for it.
 *
 * The RPC takes NO confidence, NO resolver version and NO reason signals —
 * only facts this side actually knows and the database cannot (which place was
 * proposed, what else was offered, how the pin was obtained). Everything a
 * later analysis would read is computed inside the transaction that stores it,
 * which is what makes the row un-forgeable through a plain PostgREST call.
 */
async function recordProposal(
  supabase: SupabaseClient,
  input: {
    destinationPlaceId: string;
    proposedPlaceId: string;
    alternativePlaceIds: string[];
    pinOrigin: PinOrigin;
    geocoderResultCount: number | null;
    geocoderCountryMismatch: boolean | null;
    importId: string | null;
    importCandidateId: string | null;
  }
): Promise<{ confidence: number; resolverVersion: string; distanceMeters: number } | null> {
  const { data, error } = await supabase.rpc('create_place_resolution_proposal', {
    p_destination_place_id: input.destinationPlaceId,
    p_proposed_place_id: input.proposedPlaceId,
    p_alternative_place_ids: input.alternativePlaceIds,
    p_pin_origin: input.pinOrigin,
    p_geocoder_result_count: input.geocoderResultCount,
    p_geocoder_country_mismatch: input.geocoderCountryMismatch,
    p_import_id: input.importId,
    p_import_candidate_id: input.importCandidateId,
  });

  if (error || !data) {
    log.warn('place_import.proposal_not_recorded', {
      reason:
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message).slice(0, 160)
          : 'unknown',
    });
    return null;
  }

  const row = data as { resolution_confidence: number | string; resolver_version: string; reason_signals: unknown };
  const signals = (row.reason_signals ?? {}) as { distanceMeters?: unknown };
  return {
    confidence: typeof row.resolution_confidence === 'number'
      ? row.resolution_confidence
      : Number(row.resolution_confidence),
    resolverVersion: row.resolver_version,
    distanceMeters: typeof signals.distanceMeters === 'number' ? signals.distanceMeters : 0,
  };
}

/**
 * The extraction candidate a saved place came from, when it came from an
 * import. Looked up by name because `markCandidateAccepted` has not run yet at
 * proposal time — and because a name is what actually ties the two together
 * (dedupeCandidates guarantees one candidate per name per import).
 */
async function candidateIdFor(
  supabase: SupabaseClient,
  importId: string | null,
  name: string
): Promise<string | null> {
  if (!importId) return null;
  try {
    const { data } = await supabase
      .from('import_candidates')
      .select('id')
      .eq('import_id', importId)
      .eq('name', name)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data ? ((data as { id: string }).id ?? null) : null;
  } catch {
    // Provenance only — never worth failing a save over.
    return null;
  }
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
