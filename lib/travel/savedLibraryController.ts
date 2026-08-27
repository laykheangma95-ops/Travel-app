// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 MEDIUM-2 remediation.
//
// WHY THIS MODULE EXISTS: components/travel/ItineraryEditor.tsx's Saved-tab
// picker used to keep this logic inline — a self-invalidating fetch effect
// (HIGH-2) and an add-to-trip call that silently dropped the traveler's
// selected day (MEDIUM-4). Both were fixed, but the review's final pass
// found the tests that were meant to protect the fixes didn't actually
// import the component's real code — a hand-written simulator proved the
// PATTERN was sound, not that the SHIPPED component still follows it.
//
// This repo's Vitest config has no JSX/TSX transform (see
// tests/placeImportReview.viewPlace.test.ts's own header for the established
// precedent), so ItineraryEditor.tsx itself can never be imported by a test.
// The fix already used elsewhere for exactly this constraint —
// lib/travel/importOutcome.ts's `viewPlaceHref`/`importOutcomeStatus`,
// lib/travel/requestGeneration.ts's `RequestGeneration` — is the same one
// applied here: pull the actual decision logic out of the component into a
// plain module the component imports and a test can import too. What is left
// inside ItineraryEditor.tsx after this is orchestration only — read state,
// call one of these functions, apply the result to `useState` — with
// nowhere left for the two fixed bugs to quietly come back.
// ─────────────────────────────────────────────────────────────────────────────

import type { ItineraryCategory } from './itinerary';
import type { RequestGeneration } from './requestGeneration';

/** The wire shape GET /api/travel/places/saved returns — the same one
 *  app/you/saved/page.tsx reads. Moved here (out of the component) because
 *  `fetchSavedLibrary` below is the one place that actually parses it. */
export interface LibraryPlace {
  savedId: string;
  placeId: string;
  name: string;
  localName: string | null;
  countryName: string;
  city: string | null;
  category: ItineraryCategory;
  address: string | null;
  saveCount: number;
}

/**
 * Pure. Should the Saved-tab library actually start loading right now?
 *
 * This is the ENTIRE self-invalidation bug (HIGH-2), reduced to the one
 * decision that mattered: `alreadyStarted` is read from — and only ever set
 * by — a ref, never from `libraryPlaces`/`libraryState`. There is nothing
 * here for a re-render to invalidate, because this function does not run
 * inside an effect and has no notion of "the previous render's cleanup" at
 * all — it is called once, synchronously, and its answer is acted on
 * immediately.
 */
export function shouldStartLibraryLoad(params: {
  picker: boolean;
  destination: string | null;
  alreadyStarted: boolean;
}): boolean {
  return params.picker && params.destination !== null && !params.alreadyStarted;
}

/** The real GET call the Saved tab's picker makes — the exact URL shape,
 *  moved out of the component so a test can call this function directly
 *  rather than reconstructing the URL a second time. `fetchImpl` defaults to
 *  the global fetch; a test supplies one that reaches a real route handler,
 *  never a hand-written stand-in for what the route returns. */
export async function fetchSavedLibrary(
  destination: string,
  fetchImpl: typeof fetch = fetch
): Promise<LibraryPlace[]> {
  const response = await fetchImpl(`/api/travel/places/saved?destination=${encodeURIComponent(destination)}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('library unavailable');
  const result = (await response.json()) as { places: LibraryPlace[] };
  return result.places;
}

export interface LibraryLoadPorts {
  fetchImpl: (destination: string) => Promise<LibraryPlace[]>;
  setLoading: () => void;
  setLoaded: (places: LibraryPlace[]) => void;
  setError: () => void;
}

/**
 * Runs one load attempt end to end: mints a new generation ticket, tells the
 * caller loading has started, fetches, and applies success or error — but
 * ONLY if this attempt is still the current one when it resolves. A second,
 * newer call to this function (the "Try again" retry button) supersedes
 * whichever attempt was still in flight; that stale attempt's answer, if it
 * arrives late, is discarded here rather than in the component.
 *
 * This is the ENTIRE staleness/lifecycle half of HIGH-2. The component's
 * `loadLibrary` is a five-line wrapper around this — there is no second copy
 * of this state machine anywhere.
 */
export async function runSavedLibraryLoad(
  destination: string,
  generation: RequestGeneration,
  ports: LibraryLoadPorts
): Promise<void> {
  const ticket = generation.next();
  ports.setLoading();
  try {
    const places = await ports.fetchImpl(destination);
    if (!generation.isCurrent(ticket)) return; // superseded
    ports.setLoaded(places);
  } catch {
    if (!generation.isCurrent(ticket)) return;
    ports.setError();
  }
}

// ── Saved place → a specific selected day (MEDIUM-4) ───────────────────────

export interface AddSavedPlaceTarget {
  /** null means the Ideas context — the sheet was opened with no specific
   *  day selected, so landing in Ideas is already correct and nothing more
   *  needs to happen after the add. */
  dayId: string | null;
}

export interface AddSavedPlacePorts {
  /** POST /api/travel/places/:id/add-to-trip, in whatever shape the caller's
   *  fetch wrapper returns it. */
  addToTrip: (
    placeId: string,
    tripId: string
  ) => Promise<{ status?: string; alreadyAdded?: boolean; error?: { message?: string } } | null>;
  /** Look up the itinerary_places id the add just filed into Ideas, by the
   *  canonical place id — the only way to name it for the move that follows,
   *  since add-to-trip's own response carries no item id. */
  findFiledIdeaId: (canonicalPlaceId: string) => Promise<string | null>;
  /** The existing itinerary PATCH `move` action. */
  moveToDay: (dayId: string, itineraryPlaceId: string) => Promise<void>;
}

export type AddSavedPlaceResult = { ok: true } | { ok: false; message: string };

/**
 * Add a place from the traveler's global saved_places library onto this
 * trip, honouring whichever day the picker sheet was opened for.
 *
 * THE ENTIRE MEDIUM-4 FIX IS THIS ONE CONDITION: a fresh add (never one that
 * was already sitting somewhere on the trip — `alreadyAdded` is what keeps a
 * second tap idempotent-safe rather than relocating an already-placed item)
 * into a sheet opened for a SPECIFIC day is followed by the same `move`
 * action `addExisting`/`addCustom` already use to land things on a day. A
 * sheet opened for Ideas (`target.dayId === null`) needs nothing further —
 * add-to-trip's own only destination already IS Ideas.
 */
export async function addSavedPlaceToTrip(
  placeId: string,
  tripId: string,
  target: AddSavedPlaceTarget,
  ports: AddSavedPlacePorts
): Promise<AddSavedPlaceResult> {
  const added = await ports.addToTrip(placeId, tripId);
  if (!added || added.status !== 'added') {
    return { ok: false, message: added?.error?.message ?? '' };
  }

  if (!added.alreadyAdded && target.dayId) {
    const filedId = await ports.findFiledIdeaId(placeId);
    if (filedId) {
      await ports.moveToDay(target.dayId, filedId);
    }
  }

  return { ok: true };
}
