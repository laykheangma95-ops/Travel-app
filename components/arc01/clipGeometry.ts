// The ARC-01 profile, in millimetres, as a single continuous wire path.
//
// One source of truth: the WebGL model sweeps a tube along these points and
// the no-WebGL fallback strokes the same polyline as an SVG path, so the
// silhouette is identical either way.
//
// The wire runs: outer top arm → outer bend (left) → outer bottom arm →
// transfer bend (right) → inner bottom arm → inner bend (left) → inner top
// arm. Two free ends, both on the right, exactly like a gem clip.

export const WIRE_DIAMETER = 1.1;

const OUTER_Y = 3.6; // outer arm offset from the spine
const INNER_Y = 1.8; // inner arm offset
const OUTER_BEND_X = 7; // centre of the big left bend
const INNER_BEND_X = 10; // centre of the small left bend
const TRANSFER_X = 32; // centre of the right transfer bend
const OUTER_END_X = 28.5; // outer free end
const INNER_END_X = 23.5; // inner free end

const STEP = 1.1; // straight-run sampling, mm
const EPS = 1e-6;

type Pt = [number, number];

function push(out: Pt[], x: number, y: number) {
  const last = out[out.length - 1];
  if (last && Math.abs(last[0] - x) < EPS && Math.abs(last[1] - y) < EPS) return;
  out.push([x, y]);
}

function line(out: Pt[], x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.round(len / STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    push(out, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

function arc(out: Pt[], cx: number, cy: number, r: number, a0: number, a1: number) {
  // Roughly one sample per 0.35 mm of arc length, so the bends stay smooth
  // under a 40× loupe and the straights stay cheap.
  const steps = Math.max(8, Math.round((Math.abs(a1 - a0) * r) / 0.35));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    push(out, cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/** The wire centreline, sampled. */
export function clipPolyline(): Pt[] {
  const p: Pt[] = [];
  const H = Math.PI / 2;

  // outer top arm, free end → left
  line(p, OUTER_END_X, OUTER_Y, OUTER_BEND_X, OUTER_Y);
  // outer bend, 180° around the left
  arc(p, OUTER_BEND_X, 0, OUTER_Y, H, 3 * H);
  // outer bottom arm → right
  line(p, OUTER_BEND_X, -OUTER_Y, TRANSFER_X, -OUTER_Y);
  // transfer bend, 180° around the right, steps the wire inboard
  arc(p, TRANSFER_X, -(OUTER_Y + INNER_Y) / 2, (OUTER_Y - INNER_Y) / 2, -H, H);
  // inner bottom arm → left
  line(p, TRANSFER_X, -INNER_Y, INNER_BEND_X, -INNER_Y);
  // inner bend, 180° around the left
  arc(p, INNER_BEND_X, 0, INNER_Y, -H, -3 * H);
  // inner top arm → free end
  line(p, INNER_BEND_X, INNER_Y, INNER_END_X, INNER_Y);

  return p;
}

export function polylineBounds(pts: Pt[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/** `d` attribute for the SVG fallback, in the same millimetre space. */
export function clipSvgPath(pts: Pt[] = clipPolyline()): string {
  return pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${(-y).toFixed(3)}`)
    .join(' ');
}
