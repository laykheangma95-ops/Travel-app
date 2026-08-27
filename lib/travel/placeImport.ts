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
import { disambiguatedName, findMaterializedRow, findNameCollision } from '@/lib/places/addToTrip';
import { resolvePlaceForTraveler, type PlaceResolution, type RegistryPlace } from '@/lib/places/repository';
import type { CanonicalPlaceInput } from '@/lib/places/validation';
import type { PinOrigin } from '@/lib/places/resolutionConfidence';
import { isUniqueViolation } from '@/lib/supabaseError';
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

/**
 * Phase 13.5. Why a place did not get saved — never a SQLSTATE, a constraint
 * name or a uuid, because this reaches the traveler's screen verbatim.
 * `message` is already the bilingual-safe, human copy; `code` is for a test
 * or a future "try again differently" branch, not for display.
 */
export type ImportFailureCode =
  /** A concurrent write kept winning the same itinerary slot, even after the
   *  one bounded retry against a freshly-read position. */
  | 'itinerary_conflict'
  /** The traveler already has a different place under this exact name for
   *  this destination, and it could not be safely told apart from this one. */
  | 'name_conflict'
  /** The trip this batch was saving to no longer exists or is not the
   *  traveler's. */
  | 'invalid_trip'
  /** The place resolved to a different country than the trip it was going
   *  into. */
  | 'destination_mismatch'
  /** The database refused the write for a reason that is ours to fix, not
   *  the traveler's (a constraint the app sent bad data against). */
  | 'write_failed'
  | 'unknown';

export interface FailedPlace {
  name: string;
  code: ImportFailureCode;
  /** Human-readable, bilingual-safe. Never a SQLSTATE, constraint name or id. */
  message: string;
}

export interface ImportResult {
  tripId: string;
  tripTitle: string;
  createdTrip: boolean;
  /** Names that were written, in the order they were given. Derived from `addedPlaces` — kept for existing callers. */
  added: string[];
  /** Names already on this trip. Not an error — a second import of one post. */
  skipped: string[];
  /** Names that could not be written. Kept for existing callers — derived
   *  from `failedPlaces`, same relationship `added` has to `addedPlaces`. */
  failed: string[];
  /** Phase 13.5. One entry per place that could not be saved, WITH why. */
  failedPlaces: FailedPlace[];
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
  const failedPlaces: FailedPlace[] = [];

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
    } catch (cause) {
      // One bad row must not cost the traveler the other eight. The reason IS
      // kept, though — Phase 13.5: a bare `catch { failed.push(name) }` here is
      // exactly what turned a classifiable Postgres failure (23505 on a stale
      // sort_order, or on the owner-name index) into an unexplained "could not
      // be saved" with nothing in the log to diagnose it from.
      failedPlaces.push(classifyImportFailure(name, cause));
    }
  }

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    createdTrip: trip.created,
    added: addedPlaces.map((entry) => entry.name),
    skipped,
    failed: failedPlaces.map((entry) => entry.name),
    failedPlaces,
    // Only meaningful for "I imported one place" — the common single-link
    // paste. A multi-place import has no single place a "View place" link
    // could point at, so this stays null rather than picking one arbitrarily.
    // `addedPlaces` (below) carries every place's own id regardless of count.
    canonicalPlaceId: addedPlaces.length === 1 ? addedPlaces[0].canonicalPlaceId : null,
    addedPlaces,
  };
}

/**
 * Turn whatever `insertPlace`/`addIdeaToTrip` threw into a reason the
 * traveler can actually read. Reads the `reason` an internal `ApiError`
 * carries in `details` (set at each throw site below and in
 * lib/travel/savedPlaces.ts) rather than parsing a message string — a string
 * match breaks the moment somebody rewords a message; a `details.reason`
 * enum does not. `cause` itself is logged (scrubbed, code/message only, never
 * details) so a real incident is still diagnosable from the server log even
 * though the traveler never sees a SQLSTATE.
 */
function classifyImportFailure(name: string, cause: unknown): FailedPlace {
  const reason =
    cause instanceof ApiError && cause.details && typeof cause.details.reason === 'string'
      ? (cause.details.reason as ImportFailureCode)
      : 'unknown';

  log.warn('place_import.save_failed', {
    reason,
    apiErrorCode: cause instanceof ApiError ? cause.code : null,
    message: cause instanceof Error ? cause.message.slice(0, 160) : 'unknown',
  });

  const message = IMPORT_FAILURE_COPY[reason] ?? IMPORT_FAILURE_COPY.unknown;
  return { name, code: reason, message: `${message} (${name})` };
}

const IMPORT_FAILURE_COPY: Record<ImportFailureCode, string> = {
  itinerary_conflict: "Domner couldn't find a free spot for this in your itinerary. Try adding it again.",
  name_conflict: 'You already have a different place saved under this name for this destination.',
  invalid_trip: 'That trip is no longer available.',
  destination_mismatch: "This place isn't in the same destination as the trip.",
  write_failed: "Domner couldn't save this. Please try again.",
  unknown: "Domner couldn't save this. Please try again.",
};

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
 * Round a coordinate to ~1.1m precision (5 decimal places) so two floats
 * that are "the same pin" after JSON round-tripping compare equal, without
 * ever being loose enough to call two genuinely different addresses the same
 * spot. This is NEVER used to decide that two rows describe the same real
 * place — see the big comment on `insertOrReuseDestinationPlace` below for
 * why that decision is never made on geometry here — only to make a RETRY of
 * the identical request mint the same disambiguated name twice, instead of a
 * fresh one every time.
 */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * A name that will never collide with an unrelated row of the traveler's,
 * deterministically, for a place whose canonical identity is not yet known.
 * Keyed on stable evidence about THIS attempt — never on `Date.now()`, which
 * makes every retry of the identical request mint a brand new row — so that
 * retrying the same import candidate converges on the same disambiguated
 * name, and therefore the same row, rather than accumulating duplicates.
 *
 *   - real coordinates known: keyed on them (rounded — see `coordKey`).
 *   - no coordinates at all: there is no stable evidence to key on, so this
 *     falls back to the next free numbered slot given the rows that already
 *     exist. Deterministic given the CURRENT state of the table, but not
 *     retry-safe in the total absence of any evidence — see the caller's own
 *     note on that honest limitation.
 */
function disambiguatedImportName(name: string, place: ImportablePlace, nextSlot: number): string {
  const suffix =
    place.lat !== null && place.lng !== null ? ` (${coordKey(place.lat, place.lng)})` : ` (${nextSlot})`;
  const base = name.slice(0, Math.max(0, PLACE_NAME_MAX - suffix.length));
  return `${base}${suffix}`;
}

/**
 * Insert the traveler's own `destination_places` row for an imported place,
 * or reuse an existing one — Phase 13.5, remediated after the principal
 * engineer review found the original version silently merged two different
 * real places that happened to share a name (HIGH-1).
 *
 * THE INVARIANT: NAME EQUALITY ALONE IS NEVER SUFFICIENT IDENTITY EVIDENCE.
 * The only thing this function ever treats as proof two rows are the same
 * place is a MATCHING CANONICAL ID — the identical rule
 * lib/places/addToTrip.ts's `materializeDestinationPlace` already enforces
 * for "add to trip" (that big comment: "a same-named row that is unlinked,
 * or linked to a DIFFERENT canonical place, is never treated as a match").
 * This function now reuses that module's own `findMaterializedRow` and
 * `disambiguatedName` rather than a second, looser version of the same idea.
 *
 * `canonicalCandidate` is resolved by the CALLER (`insertPlace`, from
 * `resolveCanonicalCandidate`) BEFORE this runs — reordered from the
 * previous version, which inserted first and resolved after, and so had no
 * identity to check a collision against at the one moment it mattered.
 * `resolvePlaceForTraveler` only ever reads/writes the shared `places`
 * registry (migration 013), never `destination_places`, so calling it before
 * this traveler's own row exists changes nothing about what it does.
 *
 * WHAT THIS NEVER DOES: reuse a same-name row whose `canonical_place_id` is
 * NULL just because it is unlinked (case C — the traveler's incoming place
 * might be a genuinely different real place that has never been resolved
 * either), and never reuse — or match by proximity — two NULL-canonical rows
 * against each other by their coordinates (case D: geometry is used only to
 * keep a RETRY idempotent, in `disambiguatedImportName`, never to prove two
 * imports are the same place — that proof is the canonical registry's job,
 * via `resolvePlaceForTraveler`, and nothing here second-guesses it).
 */
async function insertOrReuseDestinationPlace(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  place: ImportablePlace,
  canonicalCandidate: string | null
): Promise<{ placeId: string; attachedCanonical: boolean }> {
  // Case A: the traveler already has a row proven to be this exact canonical
  // place. Reuse it outright — no insert attempt needed at all, and this is
  // what makes repeated imports of the same real place converge onto ONE row
  // (never three), keyed on identity rather than on when the request ran.
  if (canonicalCandidate) {
    const materialized = await findMaterializedRow(supabase, userId, canonicalCandidate);
    if (materialized) return { placeId: materialized, attachedCanonical: true };
  }

  const baseRow = {
    destination,
    category: place.category,
    // A place with no coordinates simply does not get a map pin, exactly as
    // in the manual add-place form. Refusing to import it would be the wrong
    // trade: the name and the note are most of the value.
    lat: place.lat ?? 0,
    lng: place.lng ?? 0,
    description: place.description.slice(0, PLACE_DESCRIPTION_MAX),
    source: 'ai_generated' as const,
    created_by: userId,
    canonical_place_id: canonicalCandidate,
  };

  const tryInsert = async (name: string) => {
    const { data, error } = await supabase
      .from('destination_places')
      .insert({ ...baseRow, name })
      .select('id')
      .single();
    if (!error && data) return data.id as string;
    if (!isUniqueViolation(error)) {
      throw new ApiError('INTERNAL', 'Could not save that place.', { reason: 'write_failed' });
    }
    return null;
  };

  const name = place.name.trim().slice(0, PLACE_NAME_MAX);
  const created = await tryInsert(name);
  if (created) return { placeId: created, attachedCanonical: canonicalCandidate !== null };

  // Name collision. Case A (a race — someone else's request for this exact
  // canonical place won and committed between the check above and this
  // insert) is the ONLY reuse this function ever performs from here on.
  const collision = await findNameCollision(supabase, userId, destination, name);
  if (collision && canonicalCandidate && collision.canonicalPlaceId === canonicalCandidate) {
    return { placeId: collision.id, attachedCanonical: true };
  }

  // Every other case — collision unlinked, collision linked to a DIFFERENT
  // canonical place, or this import itself has no canonical candidate yet —
  // is disambiguated into its own new row. Never reused, never mutated: a
  // same name proves nothing about identity, so the existing row is left
  // exactly as it was, and this import's own coordinates, description and
  // (once resolved) canonical link land on a row of their own.
  let disambiguated: string;
  if (canonicalCandidate) {
    // Same suffix strategy addToTrip.ts already uses for this exact
    // situation — deterministic on the canonical id, so a retry (or a
    // concurrent request for the same canonical place) converges on the
    // same name and is caught by the reuse check below instead of minting a
    // second row.
    disambiguated = disambiguatedName(name, canonicalCandidate);
  } else {
    const collisions = await countNameCollisions(supabase, userId, destination, name);
    disambiguated = disambiguatedImportName(name, place, collisions + 1);
  }

  const retried = await tryInsert(disambiguated);
  if (retried) return { placeId: retried, attachedCanonical: canonicalCandidate !== null };

  // The disambiguated name collided too. Only reachable on a genuine race:
  // two concurrent requests for the SAME identity (canonical id, or the same
  // rounded coordinates) minting the same disambiguated name at once. One
  // more reuse check, exactly like addToTrip.ts's own last resort — still
  // gated on canonical identity, never on the name alone.
  const afterRace = await findNameCollision(supabase, userId, destination, disambiguated);
  if (afterRace && canonicalCandidate && afterRace.canonicalPlaceId === canonicalCandidate) {
    return { placeId: afterRace.id, attachedCanonical: true };
  }

  throw new ApiError('INTERNAL', 'Could not save that place.', { reason: 'name_conflict' });
}

/**
 * How many of the traveler's own rows already occupy this name or a
 * numbered variant of it, for this destination — the next free disambiguation
 * slot when there is no canonical id and no coordinates to key on instead
 * (`disambiguatedImportName`'s fallback). Deterministic given the CURRENT
 * database state, never `Date.now()`; the honest limitation this carries is
 * documented on `insertOrReuseDestinationPlace`'s caller.
 */
async function countNameCollisions(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  name: string
): Promise<number> {
  const { count, error } = await supabase
    .from('destination_places')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .eq('destination', destination)
    .ilike('name', `${name}%`);
  if (error) throw new ApiError('INTERNAL', 'Could not save that place.', { reason: 'write_failed' });
  return count ?? 1;
}

/**
 * A traveler's own catalogue row for an imported place.
 *
 * `created_by` is the caller's id, so migration 009's policies scope it to
 * them: nobody else can read it, and it can never be mistaken for part of the
 * editorial catalogue. `source` is 'ai_generated' — the schema's own word for
 * "not hand-written by us", and the honest label for a name read out of
 * somebody's caption.
 *
 * ORDER, Phase 13.5: the canonical registry is now asked BEFORE this
 * traveler's own `destination_places` row is created or reused — see
 * `resolveCanonicalCandidate` and `insertOrReuseDestinationPlace` above —
 * because knowing the identity in advance is what let HIGH-1 be closed: a
 * collision can now be checked against the ACTUAL incoming identity, instead
 * of being resolved blind and only found out to be wrong afterward.
 */
async function insertPlace(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  place: ImportablePlace,
  provenance: { importId: string | null; importCandidateId: string | null }
): Promise<{ placeId: string; canonicalPlaceId: string | null; resolution: PlaceResolutionSummary | undefined }> {
  // Registry resolution reads `place.lat`/`place.lng` BEFORE the `?? 0`
  // fallback `insertOrReuseDestinationPlace` uses for the row itself — that
  // fallback is a "no map pin" placeholder for destination_places, never a
  // location, and (0, 0) sent into a 150m proximity search would silently
  // merge every coordinate-less import from every traveler into one row at
  // null island. A place with no real coordinates is never resolved.
  const resolution =
    place.lat !== null && place.lng !== null
      ? await resolveCanonicalCandidate(supabase, userId, destination, { ...place, lat: place.lat, lng: place.lng })
      : null;

  // Only a CONFIDENT match is treated as this attempt's identity for the
  // purpose of deciding destination_places reuse/disambiguation. 'ambiguous'
  // and 'none' behave exactly like no resolution happened — Phase 13's own
  // rule, unchanged: an unresolved or undecided identity must never be
  // "solved" by matching (or attaching to) a same-name row.
  const canonicalCandidate = resolution?.decision === 'auto' ? resolution.place.id : null;

  const { placeId, attachedCanonical } = await insertOrReuseDestinationPlace(
    supabase,
    userId,
    destination,
    place,
    canonicalCandidate
  );

  if (resolution?.decision === 'ambiguous') {
    const summary = await recordAmbiguousProposal(supabase, placeId, resolution, place, provenance);
    return { placeId, canonicalPlaceId: null, resolution: summary };
  }

  return {
    placeId,
    canonicalPlaceId: attachedCanonical ? canonicalCandidate : null,
    resolution: undefined,
  };
}

/**
 * Ask the shared canonical registry (migration 013) what it thinks of this
 * place, WITHOUT writing anything to `destination_places` — a preview, not a
 * commit. Phase 13.5: moved ahead of the traveler's own row so that row's
 * insert/reuse decision can be made with the actual identity in hand, instead
 * of blind. Safe to call first: `resolvePlaceForTraveler` only ever
 * reads/writes the shared `places` registry itself (a proximity match, or a
 * fresh `unverified` row when there is none) — it does not touch, and does
 * not need, this traveler's own `destination_places` row to exist yet.
 *
 * WHY THIS CAN NEVER FAIL THE SAVE: wrapped the same "belt and braces" way
 * `recordPlaceSource`/`markCandidateAccepted` are — a registry-side lookup
 * must never turn a successful save into a failed one.
 *
 * WHY THE CALLER'S SESSION CLIENT: resolution must only ever see places this
 * traveler's own RLS already permits (published, or their own unverified
 * rows), and anything it creates must land as `unverified` — the ceiling RLS
 * enforces on that client and nothing here overrides.
 */
async function resolveCanonicalCandidate(
  supabase: SupabaseClient,
  userId: string,
  destination: string,
  place: ImportablePlace & { lat: number; lng: number }
): Promise<PlaceResolution | null> {
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

    return await resolvePlaceForTraveler(supabase, userId, input, {
      pinOrigin,
      geocoderResultCount: place.geocodeResultCount ?? null,
      geocoderCountryMismatch: place.geocodeCountryMismatch ?? null,
    });
  } catch (cause) {
    log.warn('place_import.registry_link_failed', {
      reason: cause instanceof Error ? cause.message.slice(0, 160) : 'unknown',
    });
    return null;
  }
}

/**
 * Record an 'ambiguous' proposal against the traveler's own (already
 * created) `destination_places` row. Phase 13's rule, unchanged by Phase
 * 13.5: `canonical_place_id` stays null — this is never a link, only a
 * question — and the row this proposal is recorded against is now always a
 * FRESHLY created or provably-reused-by-identity row (never a same-name row
 * this function's caller merely guessed was the same place), so there is
 * never a risk of a second proposal landing on a row that already has one.
 */
async function recordAmbiguousProposal(
  supabase: SupabaseClient,
  destinationPlaceId: string,
  resolution: PlaceResolution,
  place: ImportablePlace,
  provenance: { importId: string | null; importCandidateId: string | null }
): Promise<PlaceResolutionSummary | undefined> {
  try {
    // Same derivation `resolveCanonicalCandidate` used to produce the
    // resolution being recorded here — never re-guessed from the resolution
    // itself, always from the place, so shown and stored agree.
    const pinOrigin: PinOrigin =
      place.pinSource === 'maps-link' ? 'maps-link' : place.pinSource ? 'geocoder' : 'unknown';

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
    if (!recorded) return undefined;

    return {
      decision: 'ambiguous',
      confidence: recorded.confidence,
      resolverVersion: recorded.resolverVersion,
      proposed: toCandidateSummary(resolution.place, recorded.distanceMeters),
      alternatives: resolution.alternatives.map((a) => toCandidateSummary(a.place, a.meters)),
    };
  } catch (cause) {
    log.warn('place_import.registry_link_failed', {
      reason: cause instanceof Error ? cause.message.slice(0, 160) : 'unknown',
    });
    return undefined;
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
