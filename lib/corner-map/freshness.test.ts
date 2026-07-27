import { describe, expect, it } from 'vitest';
import { coldestToFreshest, freshnessOf, heatOf, TIER } from './freshness';

// Fixed clock — freshness is entirely a function of elapsed time, so the tests
// pin `now` and move `captured_at` around it.
const NOW = new Date('2026-07-27T19:42:00.000Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('freshnessOf — tier boundaries', () => {
  it('is LIVE right up to the 60 minute edge', () => {
    expect(freshnessOf(ago(0), NOW)).toBe('LIVE');
    expect(freshnessOf(ago(59), NOW)).toBe('LIVE');
    expect(freshnessOf(ago(59.999), NOW)).toBe('LIVE');
  });

  it('flips to TODAY exactly at 60 minutes', () => {
    expect(freshnessOf(ago(60), NOW)).toBe('TODAY');
    expect(freshnessOf(ago(61), NOW)).toBe('TODAY');
  });

  it('is TODAY right up to the 24 hour edge', () => {
    expect(freshnessOf(ago(23 * 60), NOW)).toBe('TODAY');
    expect(freshnessOf(ago(24 * 60 - 1), NOW)).toBe('TODAY');
  });

  it('flips to WEEK exactly at 24 hours', () => {
    expect(freshnessOf(ago(24 * 60), NOW)).toBe('WEEK');
    expect(freshnessOf(ago(25 * 60), NOW)).toBe('WEEK');
  });

  it('is WEEK right up to the 7 day edge', () => {
    expect(freshnessOf(ago(6 * 24 * 60), NOW)).toBe('WEEK');
    expect(freshnessOf(ago(7 * 24 * 60 - 1), NOW)).toBe('WEEK');
  });

  it('flips to ARCHIVE exactly at 7 days', () => {
    expect(freshnessOf(ago(7 * 24 * 60), NOW)).toBe('ARCHIVE');
    expect(freshnessOf(ago(365 * 24 * 60), NOW)).toBe('ARCHIVE');
  });

  it('treats a future capture time as brand new rather than stale', () => {
    // Client clock skew: captured_at comes from the device, not the server.
    expect(freshnessOf(new Date(NOW.getTime() + 5 * 60_000), NOW)).toBe('LIVE');
  });
});

describe('--live is a state colour', () => {
  it('only LIVE carries the marigold token, and only LIVE pulses', () => {
    expect(TIER.LIVE.token).toBe('--live');
    expect(TIER.LIVE.pulses).toBe(true);
    for (const tier of ['TODAY', 'WEEK', 'ARCHIVE'] as const) {
      expect(TIER[tier].token).not.toBe('--live');
      expect(TIER[tier].hex).not.toBe(TIER.LIVE.hex);
      expect(TIER[tier].pulses).toBe(false);
    }
  });

  it('desaturates on the §2 curve: none, none, slight, heavy', () => {
    expect(TIER.LIVE.filter).toBe('none');
    expect(TIER.TODAY.filter).toBe('none');
    expect(TIER.WEEK.filter).toContain('saturate(0.85)');
    expect(TIER.ARCHIVE.filter).toContain('saturate(0.4)');
    expect(TIER.ARCHIVE.grain).toBe(true);
  });
});

describe('heatOf', () => {
  it('is 0 for a corner with no shots', () => {
    expect(heatOf([], NOW)).toBe(0);
  });

  it('halves every 6 hours', () => {
    expect(heatOf([ago(0)], NOW)).toBeCloseTo(1, 5);
    expect(heatOf([ago(6 * 60)], NOW)).toBeCloseTo(0.5, 5);
    expect(heatOf([ago(12 * 60)], NOW)).toBeCloseTo(0.25, 5);
    expect(heatOf([ago(24 * 60)], NOW)).toBeCloseTo(0.0625, 5);
  });

  it('caps at 1 so one viral corner cannot dominate the map', () => {
    const many = Array.from({ length: 200 }, () => ago(1));
    expect(heatOf(many, NOW)).toBe(1);
  });

  it('accumulates across shots', () => {
    const two = heatOf([ago(6 * 60), ago(12 * 60)], NOW);
    expect(two).toBeCloseTo(0.75, 5);
    expect(two).toBeGreaterThan(heatOf([ago(6 * 60)], NOW));
  });

  it('does not score a future shot above a brand-new one', () => {
    expect(heatOf([new Date(NOW.getTime() + 3_600_000)], NOW)).toBe(1);
  });

  it('goes cold for an archive-only corner', () => {
    expect(heatOf([ago(30 * 24 * 60)], NOW)).toBeLessThan(0.001);
  });
});

describe('coldestToFreshest', () => {
  it('takes the freshest tier present at the corner', () => {
    expect(coldestToFreshest([ago(9 * 24 * 60), ago(30)], NOW)).toBe('LIVE');
    expect(coldestToFreshest([ago(9 * 24 * 60), ago(3 * 60)], NOW)).toBe('TODAY');
    expect(coldestToFreshest([ago(9 * 24 * 60), ago(3 * 24 * 60)], NOW)).toBe('WEEK');
    expect(coldestToFreshest([ago(9 * 24 * 60)], NOW)).toBe('ARCHIVE');
  });

  it('reads an empty corner as ARCHIVE — a cold node', () => {
    expect(coldestToFreshest([], NOW)).toBe('ARCHIVE');
  });
});
