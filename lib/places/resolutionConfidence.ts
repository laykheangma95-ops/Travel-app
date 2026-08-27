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
// the countries agree, where the pin came from). This is arithmetic over
// evidence that already exists — never a trained model, never a guess dressed
// up as one.
//
// RESOLVER_VERSION is stamped onto every score this module produces and stored
// alongside every decision (migration 017). A decision made under one set of
// thresholds is not evidence about a later set — re-tuning AUTO_LINK_CONFIDENCE
// or AMBIGUOUS_FLOOR_CONFIDENCE must never be read as having applied
// retroactively to history.
//
// THIS FUNCTION HAS A TWIN IN SQL. migration 017 implements the identical
// formula as `public.place_resolution_score`, because the database — not the
// application — is what actually writes a stored confidence (a traveler holds
// the anon key and can call PostgREST directly, so "our code computes it
// honestly" is not a control). tests/resolutionConfidence.sqlTwin.test.ts runs
// both implementations over the same matrix against a real Postgres and
// asserts they agree, exactly as tests/places.normalize.test.ts pins
// normalizePlaceName/geohashEncode to their own SQL twins.
//
// EVERY SIGNAL BELOW IS PRODUCTION-REACHABLE. A confidence factor that only a
// unit-test fixture can produce is a lie about how the score is computed, so
// resolution-v1 carries none: the Phase 13 review found a `cityMismatch`
// factor no production path could ever set (the importer never supplies a
// city) and it was removed rather than left in as decoration.
// ─────────────────────────────────────────────────────────────────────────────

import { SAME_PLACE_RADIUS_M } from './normalize';

/**
 * Round to three decimals, the one way both this module and its SQL twin can
 * reproduce bit for bit.
 *
 * NOT `Number(x.toFixed(3))`, which is what this used to be. `toFixed` rounds
 * on the double's exact binary expansion (0.6475 is really
 * 0.647499999999999964…, so it gives 0.647), and no Postgres expression
 * reproduces that: casting float8 to numeric goes through the shortest
 * round-tripping decimal, which is 0.6475 and rounds half-up to 0.648. The
 * twin test caught the disagreement. `Math.round(x * 1000) / 1000` acts on the
 * SCALED DOUBLE instead, which `floor(x * 1000 + 0.5) / 1000` reproduces
 * exactly in float8 — same value in, same value out, in both languages.
 */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

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
  /** null when there was nothing to compare (one side had no country
   *  on record) — a genuine "don't know", never coerced to a match. */
  countryMatch: boolean | null;
  pinOrigin: PinOrigin;
  /**
   * How many results the geocoder itself returned for this query, when a
   * geocoder produced the pin. null when the pin did not come from one.
   *
   * RECORDED, NOT SCORED. It is deliberately absent from the formula below:
   * `alternativeCount` already carries the ambiguity that matters here (how
   * many canonical rows genuinely compete for this save), and penalising a
   * geocoder's own result count on top of it would charge the same doubt
   * twice. It is kept as evidence so a later resolver version can be
   * calibrated against real decisions rather than guessed at.
   */
  geocoderResultCount: number | null;
}

export interface ResolutionScoreInput {
  /** Distance to the nearest candidate. Always present — this is only ever
   *  scored once a nearby match already exists. */
  distanceMeters: number;
  alternativeCount: number;
  /**
   * true = disagree, false = agree, null = not comparable.
   *
   * ONE combined country signal, not two. Two different facts can raise
   * country doubt — the geocoder reporting that every candidate it returned
   * disagreed with the expected country, and the matched canonical row's own
   * country differing from the candidate's. lib/places/repository.ts folds
   * them together (either one alone is doubt) so the penalty is applied once
   * rather than compounding the same worry twice.
   */
  countryMismatch: boolean | null;
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
 *
 * Three factors, and every one of them is reachable from the real import
 * path — see this module's header on why a fourth (city) was removed.
 *
 * A country mismatch that could not be checked (null) applies no penalty —
 * asserting doubt about something never compared would be a made-up signal,
 * which this module exists to avoid.
 */
export function scoreResolution(input: ResolutionScoreInput): ResolutionScore {
  // The proximity curve, INLINED rather than taken from proximityConfidence,
  // and rounded ONCE at the end rather than here and again below.
  // proximityConfidence rounds its own result, and rounding twice made the
  // score depend on an intermediate that the SQL twin could not reproduce —
  // see round3 above. The curve itself is identical: 1.0 touching, 0.5 at
  // SAME_PLACE_RADIUS_M, 0 at or beyond it.
  let score =
    input.distanceMeters >= SAME_PLACE_RADIUS_M
      ? 0
      : 1 - (input.distanceMeters / SAME_PLACE_RADIUS_M) * 0.5;

  if (input.countryMismatch === true) score *= 0.85;
  if (input.pinOrigin === 'geocoder') score *= 0.8;
  if (input.alternativeCount > 0) score *= 0.7;

  score = round3(Math.max(0, Math.min(1, score)));

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
      pinOrigin: 'unknown',
      geocoderResultCount: null,
    },
  };
}
