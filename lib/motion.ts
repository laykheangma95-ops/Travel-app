// ─────────────────────────────────────────────────────────────────────────────
// Motion tokens and a ~1KB tween runner.
//
// Why not GSAP, which is already a dependency? Because three.js plus GSAP core
// plus ScrollTrigger overruns the homepage's 200KB budget for the 3D layer, and
// the camera flight needs a hand-written easing anyway. GSAP stays in use on
// the flight pages; the homepage runs on this file.
//
// The rule that makes motion read as expensive: named easings and named
// durations, reused everywhere. Nothing here is improvised per element.
// ─────────────────────────────────────────────────────────────────────────────

/** Cubic-bezier control points, matched to the CSS custom properties. */
export const EASE = {
  /** Reveals and position changes. The house ease — matches the design system. */
  signature: [0.22, 1, 0.36, 1],
  /** Hovers and small state changes. */
  smooth: [0.4, 0, 0.2, 1],
  /** The camera. Slow to leave, very long tail — this is what reads as weight. */
  flight: [0.6, 0.02, 0.12, 1],
  /** Arrival: one gentle settle, no bounce. */
  settle: [0.16, 1, 0.3, 1],
} as const;

export const DURATION = {
  micro: 220,
  reveal: 800,
  chapter: 900,
  flight: 2600,
  flightReduced: 1200,
} as const;

/** Evaluate a cubic-bezier curve at x, by Newton iteration on the parametric t. */
export function cubicBezier(p: readonly number[]) {
  const [x1, y1, x2, y2] = p;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 5; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-5) break;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return sampleY(t);
  };
}

export const easeSignature = cubicBezier(EASE.signature);
export const easeFlight = cubicBezier(EASE.flight);
export const easeSettle = cubicBezier(EASE.settle);

export interface TweenHandle {
  /** Stop without running the final frame. */
  cancel(): void;
  /** 0–1 progress at the moment it is read. */
  readonly progress: number;
}

/**
 * rAF tween. `onUpdate` gets eased 0–1. Returns a handle so a flight in
 * progress can be interrupted and re-aimed from wherever it had reached — the
 * property that makes searching a second destination feel continuous rather
 * than cancelled and restarted.
 */
export function tween(opts: {
  duration: number;
  ease?: (x: number) => number;
  onUpdate: (eased: number, raw: number) => void;
  onComplete?: () => void;
}): TweenHandle {
  const ease = opts.ease ?? easeSignature;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;
  let progress = 0;

  const frame = (now: number) => {
    if (cancelled) return;
    progress = opts.duration <= 0 ? 1 : Math.min(1, (now - start) / opts.duration);
    opts.onUpdate(ease(progress), progress);
    if (progress < 1) raf = requestAnimationFrame(frame);
    else opts.onComplete?.();
  };
  raf = requestAnimationFrame(frame);

  return {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
    get progress() {
      return progress;
    },
  };
}

/** Linear interpolation, and the shortest-way-round variant for longitudes. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** '#1b2f5e' → [r, g, b] in 0–1. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
