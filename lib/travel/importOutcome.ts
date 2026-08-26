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

/** What POST /api/travel/places/import always returns, whichever flow called it. */
export interface ImportOutcome {
  tripId: string;
  tripTitle: string;
  createdTrip: boolean;
  added: string[];
  skipped: string[];
  failed: string[];
  /** The one added place's canonical registry id, when there was one. See lib/travel/placeImport.ts. */
  canonicalPlaceId: string | null;
  /** One entry per added place, own id included. See lib/travel/placeImport.ts's ImportResult. */
  addedPlaces: { name: string; canonicalPlaceId: string | null }[];
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
