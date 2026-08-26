// ─────────────────────────────────────────────────────────────────────────────
// Resolution confidence — Phase 13.
//
// "Which real-world canonical place is this?" is a different question from
// import_candidates.confidence's "does this text name a place?" (Phase 1). The
// two must never be conflated: an extraction can be certain the caption names
// a real place and still be wrong about WHICH one, and a resolver can be
// confident about identity even when the model itself was hedging. See
// docs/SOCIAL-SAVE.md Part 16 for the full separation.
//
// PURE. No I/O, no AI, no provider. Every input here is either already
// computed by lib/places/normalize.ts's proximityConfidence (distance) or
// already available to the caller (how many other candidates matched, whether
// country/city agree, where the pin came from). This is arithmetic over
// evidence that already exists — never a trained model, never a guess dressed
// up as one.
//
// RESOLVER_VERSION is stamped onto every score this module produces and stored
// alongside every decision (migration 017). A decision made under one set of
// thresholds is not evidence about a later set — re-tuning AUTO_LINK_CONFIDENCE
// or AMBIGUOUS_FLOOR_CONFIDENCE must never be read as having applied
// retroactively to history.
// ─────────────────────────────────────────────────────────────────────────────

import { proximityConfidence } from './normalize';

/** Bumped whenever the scoring formula or its thresholds change. */
export const RESOLVER_VERSION = 'resolution-v1';

/** At or above this, a proposal is attached without asking. */
export const AUTO_LINK_CONFIDENCE = 0.85;

/** At or above this (and below AUTO_LINK_CONFIDENCE), the traveler is asked.
 *  Below it, there is not enough evidence to ask about — the place is left
 *  unresolved, silently, exactly as an unresolved place behaves today. */
export const AMBIGUOUS_FLOOR_CONFIDENCE = 0.5;

export type ResolutionDecision = 'auto' | 'ambiguous' | 'none';

/** Where the coordinates being resolved came from. Never invented — this is
 *  read off the candidate that produced them (PlaceCandidate.source). */
export type PinOrigin = 'maps-link' | 'geocoder' | 'unknown';

/** The evidence a score was built from, kept alongside every decision so a
 *  wrong one is explainable rather than mysterious — the same reasoning
 *  migration 013 gives `place_external_ids.match_confidence`. */
export interface ResolutionReasonSignals {
  distanceMeters: number;
  /** How many OTHER candidates matched inside the radius. 0 means the top
   *  match was the only one. */
  alternativeCount: number;
  /** null when there was nothing to compare (one side had no country/city
   *  on record) — a genuine "don't know", never coerced to a match. */
  countryMatch: boolean | null;
  cityMatch: boolean | null;
  pinOrigin: PinOrigin;
  /** How many results the geocoder itself returned for this query, when a
   *  geocoder produced the pin. null when the pin did not come from one. */
  geocoderResultCount: number | null;
}

export interface ResolutionScoreInput {
  /** Distance to the nearest candidate. Always present — this is only ever
   *  scored once a nearby match already exists. */
  distanceMeters: number;
  alternativeCount: number;
  /** true = disagree, false = agree, null = not comparable. */
  countryMismatch: boolean | null;
  cityMismatch: boolean | null;
  pinOrigin: PinOrigin;
  geocoderResultCount: number | null;
}

export interface ResolutionScore {
  confidence: number;
  decision: ResolutionDecision;
  reasonSignals: ResolutionReasonSignals;
  resolverVersion: string;
}

/**
 * Score how confident the resolver should be that the nearest name+proximity
 * match IS the place a traveler meant, and what to do about it.
 *
 * THE PENALTIES ARE MULTIPLICATIVE, NOT ADDITIVE — each one is "how much of
 * my remaining confidence survives this piece of doubt", not a flat
 * deduction, so two weak signals compound the way they should (a geocoded pin
 * with a second nearby candidate is worse than either alone) without ever
 * pushing the score negative.
 *
 *   base        proximityConfidence(distance) — 1.0 touching, 0.5 at 150m.
 *   × 0.85      the candidate's own country disagrees with the canonical row's.
 *   × 0.80      the pin came from a geocoder guess, not an exact platform pin.
 *   × 0.70      at least one other candidate also matched inside the radius —
 *               this is the ambiguity penalty, and the heaviest one, because a
 *               second plausible candidate is exactly the "which branch?"
 *               failure this phase exists to stop resolving silently.
 *   × 0.90      the candidate's city disagrees with the canonical row's.
 *
 * A country/city mismatch that could not be checked (null) applies no
 * penalty — asserting doubt about something never compared would be a made-up
 * signal, which this module exists to avoid.
 */
export function scoreResolution(input: ResolutionScoreInput): ResolutionScore {
  let score = proximityConfidence(input.distanceMeters);

  if (input.countryMismatch === true) score *= 0.85;
  if (input.pinOrigin === 'geocoder') score *= 0.8;
  if (input.alternativeCount > 0) score *= 0.7;
  if (input.cityMismatch === true) score *= 0.9;

  score = Number(Math.max(0, Math.min(1, score)).toFixed(3));

  const decision: ResolutionDecision =
    score >= AUTO_LINK_CONFIDENCE ? 'auto' : score >= AMBIGUOUS_FLOOR_CONFIDENCE ? 'ambiguous' : 'none';

  return {
    confidence: score,
    decision,
    resolverVersion: RESOLVER_VERSION,
    reasonSignals: {
      distanceMeters: input.distanceMeters,
      alternativeCount: input.alternativeCount,
      countryMatch: input.countryMismatch === null ? null : !input.countryMismatch,
      cityMatch: input.cityMismatch === null ? null : !input.cityMismatch,
      pinOrigin: input.pinOrigin,
      geocoderResultCount: input.geocoderResultCount,
    },
  };
}

/** A freshly created canonical row is trivially itself — there is nothing to
 *  be ambiguous about. Named so a caller never has to fake a distance of 0
 *  through scoreResolution to express "this just became the canonical row". */
export function createdPlaceScore(): ResolutionScore {
  return {
    confidence: 1,
    decision: 'auto',
    resolverVersion: RESOLVER_VERSION,
    reasonSignals: {
      distanceMeters: 0,
      alternativeCount: 0,
      countryMatch: null,
      cityMatch: null,
      pinOrigin: 'unknown',
      geocoderResultCount: null,
    },
  };
}
