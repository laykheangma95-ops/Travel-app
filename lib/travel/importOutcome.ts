// ─────────────────────────────────────────────────────────────────────────────
// The shape POST /api/travel/places/import always returns (lib/travel/
// placeImport.ts's ImportResult, unchanged on the wire), plus the one decision
// a caller makes from it: where the "saved" screen's optional "View place"
// link goes.
//
// A PLAIN .ts MODULE ON PURPOSE. This lives here rather than inline in
// components/travel/PlaceImportReview.tsx (a 'use client' component with JSX)
// so it can be imported from a test file directly — this repo's Vitest config
// has no JSX/TSX transform, only plain TS (see vitest.config.ts), so a pure
// decision function that needs a regression test has to live somewhere a
// .test.ts file can reach it without parsing JSX. Same reasoning as
// lib/travel/itinerary.ts's placeDetailHref.
// ─────────────────────────────────────────────────────────────────────────────

import type { AddedPlace, FailedPlace } from './placeImport';

/** What POST /api/travel/places/import always returns, whichever flow called it. */
export interface ImportOutcome {
  tripId: string;
  tripTitle: string;
  createdTrip: boolean;
  added: string[];
  skipped: string[];
  failed: string[];
  /** Phase 13.5. One entry per place that could not be saved, with why. */
  failedPlaces: FailedPlace[];
  /** The one added place's canonical registry id, when there was one. See lib/travel/placeImport.ts. */
  canonicalPlaceId: string | null;
  /** One entry per added place, own id included — and, since Phase 13, an
   *  optional `resolution` proposal awaiting confirmation. See
   *  lib/travel/placeImport.ts's ImportResult/AddedPlace. */
  addedPlaces: AddedPlace[];
}

/**
 * Where the "View place" link on the saved screen goes, or null to render
 * none. Only ever offered for a single-place import that actually resolved —
 * with several places added there is no one place left to point at, and a
 * link is never shown for a place that never linked to the registry.
 */
export function viewPlaceHref(outcome: ImportOutcome): string | null {
  return outcome.added.length === 1 && outcome.canonicalPlaceId
    ? `/place/${outcome.canonicalPlaceId}`
    : null;
}

/**
 * Phase 13.5. What the "saved" screen's headline state actually is — the
 * decision `DoneStage` renders from rather than assuming a batch that ran
 * always ended in success. Before this, the screen showed the same green
 * check and tick for `added.length === 0` as for a full batch: the traveler
 * saw "0 Saved to your trip" under a success icon.
 *
 *   'success' — every place that was not already on the trip got saved.
 *   'partial' — at least one saved, at least one did not.
 *   'failure' — nothing was saved, and at least one place failed.
 *
 * A batch that was ENTIRELY `skipped` (every place was already on the trip,
 * nothing failed) is 'success' — nothing went wrong, there was simply nothing
 * new to do.
 */
export type ImportOutcomeStatus = 'success' | 'partial' | 'failure';

export function importOutcomeStatus(outcome: ImportOutcome): ImportOutcomeStatus {
  if (outcome.failed.length === 0) return 'success';
  return outcome.added.length > 0 ? 'partial' : 'failure';
}
