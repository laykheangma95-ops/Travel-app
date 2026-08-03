// ─────────────────────────────────────────────────────────────────────────────
// The three designed experience tiers.
//
// Our users are on mid-range Android phones on Cambodian mobile data. Rather
// than one experience that quietly falls apart on a slow device, there are
// three intentional ones — and the page must be fully usable, including buying,
// in the weakest of them.
//
//   full    — the camera descent, the day/night terminator, 20k land dots
//   reduced — a shorter rotate-and-zoom, 6.5k dots, DPR capped at 1.25
//   static  — no WebGL at all: a drawn poster, cross-fades only
//
// `static` is not a failure mode. It is what a visitor with prefers-reduced-
// motion asks for, and what a device without WebGL gets, and both of those
// people must be able to search a destination, read all six chapters and
// complete a purchase.
// ─────────────────────────────────────────────────────────────────────────────

export type Tier = 'full' | 'reduced' | 'static';

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/** Read once on mount. Frame-time slippage can demote further at runtime. */
export function detectTier(): Tier {
  if (typeof window === 'undefined') return 'static';

  // QA override: ?tier=full|reduced|static. Without it there is no way to
  // exercise a tier your own machine does not fall into, which is how designed
  // fallbacks quietly rot. Never consulted unless explicitly present.
  const forced = new URLSearchParams(window.location.search).get('tier');
  if (forced === 'full' || forced === 'reduced' || forced === 'static') return forced;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'static';
  if (!webglAvailable()) return 'static';

  const nav = navigator as NavigatorWithHints;
  if (nav.connection?.saveData) return 'reduced';
  if (['slow-2g', '2g', '3g'].includes(nav.connection?.effectiveType ?? '')) return 'reduced';
  if ((nav.hardwareConcurrency ?? 8) <= 4) return 'reduced';
  if ((nav.deviceMemory ?? 8) <= 4) return 'reduced';
  // Any touch device gets the reduced tier, core count notwithstanding. A phone
  // reporting eight cores is not a laptop: it is thermally limited, it is on
  // battery, and it is pushing a high-density display. Measured on a
  // 4x-throttled 390px viewport, `full` sustained 14.5 main-thread frames per
  // second against `reduced`'s 39.9 — and our audience is on exactly these
  // devices, so this is the branch that matters most.
  if (window.matchMedia('(pointer: coarse)').matches) return 'reduced';

  return 'full';
}

export interface TierSettings {
  dotCount: number;
  starCount: number;
  maxDpr: number;
  /** Frames per second during a flight, where smoothness is the whole point. */
  targetFps: number;
  /**
   * Frames per second while the globe is just turning. It completes one
   * revolution every ninety seconds — nobody can tell 24 from 60 at that speed,
   * and halving the frame rate halves the work for the entire time the visitor
   * is reading the question and typing an answer. Measured: total blocking time
   * on a throttled mobile profile fell from 3,230ms to well under a second.
   */
  idleFps: number;
  /** Camera actually dollies in, versus a modest zoom. */
  descend: boolean;
  /** Build the higher-density regional dot patch during a flight. */
  lodPatch: boolean;
  terminator: boolean;
  flightMs: number;
}

export const TIER_SETTINGS: Record<Tier, TierSettings> = {
  full: {
    dotCount: 20000,
    starCount: 900,
    maxDpr: 2,
    targetFps: 60,
    idleFps: 30,
    descend: true,
    lodPatch: true,
    terminator: true,
    flightMs: 2600,
  },
  reduced: {
    // Measured on a 4x-throttled 390px viewport: additive point sprites are
    // fill-rate bound, so pixels cost more than points. Dropping DPR from 1.5
    // to 1.25 bought more headroom than cutting the dot count did.
    dotCount: 6500,
    starCount: 260,
    maxDpr: 1.25,
    targetFps: 30,
    idleFps: 20,
    descend: false,
    lodPatch: false,
    terminator: true,
    flightMs: 1200,
  },
  static: {
    dotCount: 0,
    starCount: 0,
    maxDpr: 1,
    targetFps: 0,
    idleFps: 0,
    descend: false,
    lodPatch: false,
    terminator: false,
    flightMs: 0,
  },
};

/**
 * Watches frame time and demotes `full` to `reduced` if the device cannot hold
 * the pace. Sampled over a window so one slow frame during a GC pause does not
 * downgrade an otherwise capable phone.
 */
export function createFrameWatchdog(onDemote: () => void, budgetMs = 28) {
  let slow = 0;
  let samples = 0;
  let fired = false;

  return (dt: number) => {
    if (fired) return;
    samples++;
    if (dt * 1000 > budgetMs) slow++;
    if (samples >= 90) {
      if (slow / samples > 0.35) {
        fired = true;
        onDemote();
      }
      slow = 0;
      samples = 0;
    }
  };
}
