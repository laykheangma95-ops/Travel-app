'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { mulberry32 } from '@/data/arc01';

/**
 * Section 03 — the surface at 40×.
 *
 * Rather than a photograph, the wire's finish is drawn procedurally: one
 * deterministic feature list, rendered twice. Once across the plate, and once
 * again inside a loupe that follows the pointer. Because the loupe redraws the
 * same vector scene at 3.6× rather than resampling pixels, moving it over the
 * plate genuinely resolves detail the naked plate cannot show.
 */

const LENS = 210;
const ZOOM = 3.6;
const ANGLE = -0.105;

const PINS = [
  { x: 0.26, y: 0.3, side: 'right', label: 'Ra 0.012 μm · six lapping stages' },
  { x: 0.86, y: 0.44, side: 'left', label: 'No draw lines — eleven passes, all removed' },
  { x: 0.6, y: 0.735, side: 'left', label: 'Edge break 0.05 mm, cut by hand' },
] as const;

type Scratch = { x: number; y: number; len: number; w: number; a: number; light: boolean };
type Pit = { x: number; y: number; r: number };

function buildFeatures() {
  const rnd = mulberry32(0x4a2c01);

  // Two populations. The coarse one reads as texture at 1×; the fine one is
  // drawn thinner than a pixel and only resolves once the loupe is over it —
  // which is exactly the job a loupe does.
  const scratches: Scratch[] = [];
  for (let i = 0; i < 620; i++) {
    scratches.push({
      x: rnd() * 1.9 - 0.45,
      y: rnd(),
      len: 0.03 + rnd() * 0.26,
      w: 0.35 + rnd() * 0.7,
      a: 0.05 + rnd() * 0.2,
      light: rnd() > 0.42,
    });
  }
  for (let i = 0; i < 1500; i++) {
    scratches.push({
      x: rnd() * 1.9 - 0.45,
      y: rnd(),
      len: 0.01 + rnd() * 0.12,
      w: 0.1 + rnd() * 0.24,
      a: 0.1 + rnd() * 0.3,
      light: rnd() > 0.5,
    });
  }

  const pits: Pit[] = [];
  for (let i = 0; i < 120; i++) {
    pits.push({ x: rnd() * 1.9 - 0.45, y: rnd(), r: 0.18 + rnd() * 0.85 });
  }
  return { scratches, pits };
}

const FEATURES = buildFeatures();

function draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#050506';
  ctx.fillRect(-W, -H, W * 3, H * 3);

  const glow = ctx.createLinearGradient(0, 0, 0, H);
  glow.addColorStop(0, 'rgba(239,234,224,0.055)');
  glow.addColorStop(0.5, 'rgba(239,234,224,0)');
  glow.addColorStop(1, 'rgba(239,234,224,0.03)');
  ctx.fillStyle = glow;
  ctx.fillRect(-W, -H, W * 3, H * 3);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(ANGLE);
  ctx.translate(-W / 2, -H / 2);

  const top = H * 0.34;
  const bot = H * 0.76;
  const band = bot - top;
  const left = -W * 0.45;
  const right = W * 1.45;

  // Neighbouring wire, well outside the depth of field. Low contrast and
  // dissolved edges stand in for the blur, and give the plate somewhere to
  // recede to.
  const ghost = (gTop: number, gBot: number, peak: number) => {
    const g = ctx.createLinearGradient(0, gTop, 0, gBot);
    g.addColorStop(0, 'rgba(150,156,164,0)');
    g.addColorStop(0.3, `rgba(150,156,164,${peak * 0.5})`);
    g.addColorStop(0.46, `rgba(196,202,210,${peak})`);
    g.addColorStop(0.72, `rgba(90,94,100,${peak * 0.55})`);
    g.addColorStop(1, 'rgba(60,63,68,0)');
    ctx.fillStyle = g;
    ctx.fillRect(left, gTop, right - left, gBot - gTop);
  };
  ghost(-H * 0.06, H * 0.2, 0.2);
  ghost(H * 0.94, H * 1.16, 0.13);

  // The wire, seen as a cylinder lit from above.
  const metal = ctx.createLinearGradient(0, top, 0, bot);
  const stops: Array<[number, string]> = [
    [0, '#17181b'],
    [0.05, '#4a4d53'],
    [0.14, '#9aa0a8'],
    [0.23, '#eef1f5'],
    [0.33, '#bcc1c8'],
    [0.5, '#6b6e74'],
    [0.68, '#3a3c41'],
    [0.83, '#84888f'],
    [0.93, '#46484d'],
    [1, '#121316'],
  ];
  stops.forEach(([o, c]) => metal.addColorStop(o, c));
  ctx.fillStyle = metal;
  ctx.fillRect(left, top, right - left, band);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, band);
  ctx.clip();

  // Specular sheet along the wire — laid down before the grain so the grain
  // stays legible across the highlight instead of being washed out by it.
  const spec = ctx.createLinearGradient(0, top + band * 0.16, 0, top + band * 0.32);
  spec.addColorStop(0, 'rgba(255,255,255,0)');
  spec.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(left, top + band * 0.16, right - left, band * 0.16);

  // Lapping grain — drawn along the wire axis, sub-pixel at 1×, individual
  // strokes under the loupe.
  ctx.lineCap = 'round';
  for (const s of FEATURES.scratches) {
    const x = left + s.x * (right - left);
    const y = top + s.y * band;
    ctx.strokeStyle = s.light
      ? `rgba(255,255,255,${s.a})`
      : `rgba(0,0,0,${s.a * 1.25})`;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s.len * (right - left) * 0.2, y + (s.a - 0.08) * 2);
    ctx.stroke();
  }

  for (const p of FEATURES.pits) {
    const x = left + p.x * (right - left);
    const y = top + p.y * band;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, p.r, p.r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(x - p.r * 0.25, y - p.r * 0.35, p.r * 0.4, p.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Chamfer at the lower edge — the hand-cut anglage of operation 07.
  const chamfer = ctx.createLinearGradient(0, bot - band * 0.075, 0, bot);
  chamfer.addColorStop(0, 'rgba(0,0,0,0.42)');
  chamfer.addColorStop(0.55, 'rgba(210,215,222,0.5)');
  chamfer.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = chamfer;
  ctx.fillRect(left, bot - band * 0.075, right - left, band * 0.075);

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(left, top + 0.3);
  ctx.lineTo(right, top + 0.3);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.moveTo(left, bot - 0.3);
  ctx.lineTo(right, bot - 0.3);
  ctx.stroke();

  ctx.restore();

  // Vignette, so the plate reads as an optic and not a rectangle.
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(-W, -H, W * 3, H * 3);
}

export function ArcMacro() {
  const stageRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLCanvasElement>(null);
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const [on, setOn] = useState(false);

  const paintPlate = useCallback(() => {
    const canvas = plateRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    sizeRef.current = { w, h };
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, h);
  }, []);

  const paintLens = useCallback(() => {
    rafRef.current = 0;
    const canvas = lensCanvasRef.current;
    const lens = lensRef.current;
    if (!canvas || !lens) return;
    const { w, h } = sizeRef.current;
    if (!w || !h) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(LENS * dpr)) {
      canvas.width = Math.round(LENS * dpr);
      canvas.height = Math.round(LENS * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = posRef.current;
    lens.style.left = `${x}px`;
    lens.style.top = `${y}px`;

    const k = dpr * ZOOM;
    ctx.setTransform(k, 0, 0, k, dpr * (LENS / 2 - x * ZOOM), dpr * (LENS / 2 - y * ZOOM));
    draw(ctx, w, h);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    paintPlate();
    posRef.current = { x: stage.clientWidth * 0.5, y: stage.clientHeight * 0.5 };
    const ro = new ResizeObserver(() => {
      paintPlate();
      paintLens();
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [paintPlate, paintLens]);

  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    posRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(paintLens);
  };

  const show = (e: ReactPointerEvent<HTMLDivElement>) => {
    track(e);
    setOn(true);
  };

  const hide = () => {
    setOn(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  };

  return (
    <section className="arc-sec arc-shell" id="macro" aria-labelledby="arc-macro-title">
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">03</span>
        <span>Detail</span>
      </div>

      <header className="arc-sec__head">
        <div className="arc-sec__headline">
          <h2 className="arc-sec__title" id="arc-macro-title" data-reveal="">
            At <em>forty</em>
            <br />
            times
          </h2>
        </div>
        <p className="arc-sec__lede" data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          The last lapping stage removes about forty nanometres of steel and takes nine
          hours. This is what it leaves behind. Move the loupe across the surface —
          there are no drawing lines anywhere on it.
        </p>
      </header>

      <div
        className="arc-macro__stage"
        ref={stageRef}
        data-lens={on}
        data-reveal=""
        onPointerEnter={(e) => e.pointerType === 'mouse' && show(e)}
        onPointerLeave={() => hide()}
        onPointerDown={(e) => e.pointerType !== 'mouse' && show(e)}
        onPointerUp={hide}
        onPointerCancel={hide}
        onPointerMove={(e) => (on || e.pointerType === 'mouse') && track(e)}
      >
        <canvas className="arc-macro__canvas" ref={plateRef} aria-hidden="true" />

        {PINS.map((p) => (
          <span
            className="arc-macro__pin"
            key={p.label}
            data-side={p.side}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            <i aria-hidden="true" />
            <span>{p.label}</span>
          </span>
        ))}

        <div className="arc-macro__lens" ref={lensRef} data-on={on} aria-hidden="true">
          <canvas ref={lensCanvasRef} />
          <span className="arc-macro__reticle" />
          <span className="arc-macro__zoom">×{ZOOM.toFixed(1)}</span>
        </div>
      </div>

      {/* Too narrow to pin labels onto the plate without them running off it —
          below 640px the same three notes are listed underneath instead. */}
      <ol className="arc-macro__legend">
        {PINS.map((p, i) => (
          <li key={p.label}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {p.label}
          </li>
        ))}
      </ol>

      <div className="arc-macro__caption">
        <span>Plate 03 — wire surface, lapped</span>
        <span>Loupe ×{ZOOM.toFixed(1)}</span>
        <span>Ra 0.012 μm</span>
      </div>
    </section>
  );
}
