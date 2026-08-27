// ─────────────────────────────────────────────────────────────────────────────
// lib/places/resolutionConfidence.ts — pure arithmetic, no I/O, no AI. This
// pins the exact scoring formula and its thresholds, so a future re-tuning is
// a deliberate, visible change to this file rather than a silent drift.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_FLOOR_CONFIDENCE,
  AUTO_LINK_CONFIDENCE,
  createdPlaceScore,
  RESOLVER_VERSION,
  scoreResolution,
  type ResolutionScoreInput,
} from '@/lib/places/resolutionConfidence';

const base: ResolutionScoreInput = {
  distanceMeters: 0,
  alternativeCount: 0,
  countryMismatch: null,
  pinOrigin: 'maps-link',
  geocoderResultCount: null,
};

describe('scoreResolution — threshold boundaries', () => {
  it('a touching, unambiguous, same-country maps-link match is confidence 1 and auto', () => {
    const score = scoreResolution(base);
    expect(score.confidence).toBe(1);
    expect(score.decision).toBe('auto');
  });

  it('exactly at AUTO_LINK_CONFIDENCE is auto, not ambiguous', () => {
    // proximityConfidence(45) = 1 - (45/150)*0.5 = 0.85
    const score = scoreResolution({ ...base, distanceMeters: 45 });
    expect(score.confidence).toBe(AUTO_LINK_CONFIDENCE);
    expect(score.decision).toBe('auto');
  });

  it('just under AUTO_LINK_CONFIDENCE is ambiguous', () => {
    const score = scoreResolution({ ...base, distanceMeters: 46 });
    expect(score.confidence).toBeLessThan(AUTO_LINK_CONFIDENCE);
    expect(score.decision).toBe('ambiguous');
  });

  it('just inside the radius edge is still above the ambiguous floor', () => {
    // proximityConfidence(149) ≈ 0.503 — SAME_PLACE_RADIUS_M itself (150) is
    // excluded by proximityConfidence's own >= check and reads 0.
    const score = scoreResolution({ ...base, distanceMeters: 149 });
    expect(score.confidence).toBeGreaterThanOrEqual(AMBIGUOUS_FLOOR_CONFIDENCE);
    expect(score.decision).toBe('ambiguous');
  });

  it('at and beyond the 150m radius, confidence is 0 and the decision is none', () => {
    const atEdge = scoreResolution({ ...base, distanceMeters: 150 });
    const beyond = scoreResolution({ ...base, distanceMeters: 151 });
    expect(atEdge.confidence).toBe(0);
    expect(atEdge.decision).toBe('none');
    expect(beyond.confidence).toBe(0);
    expect(beyond.decision).toBe('none');
  });
});

describe('scoreResolution — individual signals', () => {
  it('distance alone follows proximityConfidence exactly', () => {
    const score = scoreResolution({ ...base, distanceMeters: 75 });
    // 1 - (75/150)*0.5 = 0.75
    expect(score.confidence).toBe(0.75);
  });

  // Each multiplier is asserted at distance 0, where the proximity base is
  // exactly 1 — so the assertion is the multiplier itself rather than a
  // comparison between two separately-rounded scores. (Those comparisons were
  // subtly wrong: the score is rounded ONCE, at the end, so
  // round3(base * 0.8) is not round3(base) * 0.8.)
  it('a second candidate in range is the heaviest single penalty', () => {
    const alone = scoreResolution({ ...base, distanceMeters: 0 });
    const withAlternative = scoreResolution({ ...base, distanceMeters: 0, alternativeCount: 1 });
    expect(alone.confidence).toBe(1);
    expect(withAlternative.confidence).toBe(0.7);
    expect(withAlternative.confidence).toBeLessThan(alone.confidence);
  });

  it('a country disagreement multiplies confidence by 0.85', () => {
    expect(scoreResolution({ ...base, distanceMeters: 0, countryMismatch: false }).confidence).toBe(1);
    expect(scoreResolution({ ...base, distanceMeters: 0, countryMismatch: true }).confidence).toBe(0.85);
  });

  it('a geocoded (non-exact) pin multiplies confidence by 0.8', () => {
    expect(scoreResolution({ ...base, distanceMeters: 0, pinOrigin: 'maps-link' }).confidence).toBe(1);
    expect(scoreResolution({ ...base, distanceMeters: 0, pinOrigin: 'geocoder' }).confidence).toBe(0.8);
  });

  it('the multipliers compose in the documented order', () => {
    // 1 x 0.85 x 0.8 x 0.7 = 0.476, rounded once.
    const all = scoreResolution({
      distanceMeters: 0,
      alternativeCount: 2,
      countryMismatch: true,
      pinOrigin: 'geocoder',
      geocoderResultCount: null,
    });
    expect(all.confidence).toBe(0.476);
  });

  it('a comparison that could not be made (null) applies no penalty', () => {
    const known = scoreResolution({ ...base, distanceMeters: 10, countryMismatch: false });
    const unknown = scoreResolution({ ...base, distanceMeters: 10, countryMismatch: null });
    expect(unknown.confidence).toBe(known.confidence);
  });

  it('is rounded exactly once, so the score is not a rounded value re-multiplied', () => {
    // base(10m) = 0.96666…; the score is round3(0.96666… x 0.8) = 0.773, NOT
    // round3(round3(0.96666…) x 0.8) = round3(0.967 x 0.8) = 0.774. The SQL
    // twin can only reproduce the former — see round3 in the module header.
    const geocoded = scoreResolution({ ...base, distanceMeters: 10, pinOrigin: 'geocoder' });
    expect(geocoded.confidence).toBe(0.773);
  });

  it('penalties compound multiplicatively rather than flattening to zero', () => {
    const score = scoreResolution({
      distanceMeters: 10,
      alternativeCount: 1,
      countryMismatch: true,
      pinOrigin: 'geocoder',
      geocoderResultCount: 3,
    });
    expect(score.confidence).toBeGreaterThan(0);
    expect(score.decision).toBe('none');
  });

  it('confidence never goes negative or above 1', () => {
    const worst = scoreResolution({
      distanceMeters: 149,
      alternativeCount: 5,
      countryMismatch: true,
      pinOrigin: 'geocoder',
      geocoderResultCount: 5,
    });
    expect(worst.confidence).toBeGreaterThanOrEqual(0);
    expect(worst.confidence).toBeLessThanOrEqual(1);
  });
});

describe('scoreResolution — transparency', () => {
  it('reports the resolver version on every score', () => {
    expect(scoreResolution(base).resolverVersion).toBe(RESOLVER_VERSION);
    expect(createdPlaceScore().resolverVersion).toBe(RESOLVER_VERSION);
  });

  it('reasonSignals echoes the exact evidence the score was built from', () => {
    const score = scoreResolution({
      distanceMeters: 42,
      alternativeCount: 2,
      countryMismatch: true,
      pinOrigin: 'geocoder',
      geocoderResultCount: 4,
    });
    expect(score.reasonSignals).toEqual({
      distanceMeters: 42,
      alternativeCount: 2,
      countryMatch: false,
      pinOrigin: 'geocoder',
      geocoderResultCount: 4,
    });
  });

  it('a freshly created place is always auto, confidence 1, no alternatives implied', () => {
    const score = createdPlaceScore();
    expect(score.decision).toBe('auto');
    expect(score.confidence).toBe(1);
    expect(score.reasonSignals.alternativeCount).toBe(0);
  });
});
