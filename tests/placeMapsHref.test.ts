// ─────────────────────────────────────────────────────────────────────────────
// placeMapsHref — Phase 11's "Open in maps" link, pure and unit-tested the
// same way safeWebsiteHref (lib/places/safeLink.ts) and viewPlaceHref
// (lib/travel/importOutcome.ts) already are.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { placeMapsHref } from '@/lib/places/mapsHref';

describe('placeMapsHref', () => {
  it('builds a Google Maps search href for a real coordinate pair', () => {
    expect(placeMapsHref(13.7465, 100.4927)).toBe(
      'https://www.google.com/maps/search/?api=1&query=13.7465,100.4927'
    );
  });

  it('accepts a negative-longitude coordinate', () => {
    expect(placeMapsHref(40.7128, -74.006)).toBe(
      'https://www.google.com/maps/search/?api=1&query=40.7128,-74.006'
    );
  });

  it('rejects the (0, 0) null-island sentinel', () => {
    expect(placeMapsHref(0, 0)).toBeNull();
  });

  it('rejects NaN', () => {
    expect(placeMapsHref(Number.NaN, 100.49)).toBeNull();
    expect(placeMapsHref(13.74, Number.NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(placeMapsHref(Number.POSITIVE_INFINITY, 100.49)).toBeNull();
    expect(placeMapsHref(13.74, Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    expect(placeMapsHref(91, 0.1)).toBeNull();
    expect(placeMapsHref(0.1, 181)).toBeNull();
  });

  it('rejects non-numeric input rather than interpolating it', () => {
    expect(placeMapsHref('13.7465; DROP TABLE places', 100.49)).toBeNull();
    expect(placeMapsHref(undefined, 100.49)).toBeNull();
    expect(placeMapsHref(null, 100.49)).toBeNull();
  });

  it('coerces a numeric string the same way it coerces a number', () => {
    expect(placeMapsHref('13.7465', '100.4927')).toBe(
      'https://www.google.com/maps/search/?api=1&query=13.7465,100.4927'
    );
  });
});
