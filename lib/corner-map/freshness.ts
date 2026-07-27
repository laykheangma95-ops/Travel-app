// ═══════════════════════════════════════════════════════════════════════════
// CORNER MAP — freshness (docs/corner-map-spec.md §2)
//
// Freshness is the product *and* the design system. Everything downstream —
// node colour, node size, image treatment, stamp colour — derives from
// `age = now - captured_at` and nothing else.
//
// `--live` is a STATE colour, not a brand fill. If marigold renders on
// anything that isn't under 60 minutes old, that's a bug.
// ═══════════════════════════════════════════════════════════════════════════

export type Freshness = 'LIVE' | 'TODAY' | 'WEEK' | 'ARCHIVE';

const MIN = 60_000;

/** Tier boundaries in minutes. A shot is in a tier when age < that tier's cap. */
export const TIER_MINUTES = {
  LIVE: 60, // < 1 h
  TODAY: 1440, // < 24 h
  WEEK: 10080, // < 7 d
} as const;

export function freshnessOf(capturedAt: Date, now: Date = new Date()): Freshness {
  const min = (now.getTime() - capturedAt.getTime()) / MIN;
  if (min < TIER_MINUTES.LIVE) return 'LIVE';
  if (min < TIER_MINUTES.TODAY) return 'TODAY';
  if (min < TIER_MINUTES.WEEK) return 'WEEK';
  return 'ARCHIVE';
}

// ── Tier → presentation ────────────────────────────────────────────────────
// The single source of truth for how each tier looks. Components read this
// rather than branching on the tier themselves, so the §2 table can only be
// wrong in one place.

export interface TierTreatment {
  /** CSS custom property carrying the tier's colour. */
  token: '--live' | '--dust' | '--ash';
  /** Tailwind text-colour class for stamps and labels. */
  textClass: string;
  /** Hex, for canvas/MapLibre paint expressions that can't read CSS vars. */
  hex: string;
  /** CSS `filter` applied to the image itself. */
  filter: string;
  /** Archive shots get a grain overlay on top of the desaturation. */
  grain: boolean;
  /** Only LIVE nodes pulse. Nothing else on the map moves. */
  pulses: boolean;
}

export const TIER: Record<Freshness, TierTreatment> = {
  LIVE: {
    token: '--live',
    textClass: 'text-live',
    hex: '#FFB627',
    filter: 'none',
    grain: false,
    pulses: true,
  },
  TODAY: {
    token: '--dust',
    textClass: 'text-dust',
    hex: '#C2A878',
    filter: 'none',
    grain: false,
    pulses: false,
  },
  WEEK: {
    token: '--ash',
    textClass: 'text-ash',
    hex: '#6F827A',
    filter: 'saturate(0.85)',
    grain: false,
    pulses: false,
  },
  ARCHIVE: {
    token: '--ash',
    textClass: 'text-ash',
    hex: '#6F827A',
    filter: 'saturate(0.4) brightness(0.92)',
    grain: true,
    pulses: false,
  },
};

export const treatmentOf = (capturedAt: Date, now?: Date): TierTreatment =>
  TIER[freshnessOf(capturedAt, now)];

// ── Corner heat ────────────────────────────────────────────────────────────

/**
 * Weighted decay of a corner's shots — drives node size and colour on the map.
 *
 *   heat = min(1, Σ 0.5 ** (ageHours / 6))
 *
 * Half-life is 6 h, and the sum is capped at 1 so one viral corner can't
 * dominate the map. Mirrors the SQL in `corners_nearby()`; if you change the
 * curve, change it in both places.
 */
export function heatOf(capturedAts: readonly Date[], now: Date = new Date()): number {
  let sum = 0;
  for (const at of capturedAts) {
    // Clamp at 0: client clocks run fast, and a "future" shot must not score
    // above a brand-new one.
    const ageHours = Math.max(0, (now.getTime() - at.getTime()) / 3_600_000);
    sum += 0.5 ** (ageHours / 6);
  }
  return Math.min(1, sum);
}

/** The freshest tier present at a corner — the colour its map node takes. */
export function coldestToFreshest(capturedAts: readonly Date[], now?: Date): Freshness {
  let best: Freshness = 'ARCHIVE';
  const rank: Record<Freshness, number> = { LIVE: 3, TODAY: 2, WEEK: 1, ARCHIVE: 0 };
  for (const at of capturedAts) {
    const f = freshnessOf(at, now);
    if (rank[f] > rank[best]) best = f;
  }
  return best;
}
