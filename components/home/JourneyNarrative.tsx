'use client';

/**
 * JourneyNarrative — the "How it works" section as a scroll-pinned scene.
 *
 * A tall section holds a `position: sticky` stage. As you scroll through it, a
 * gold route arc draws itself from Phnom Penh out to the world, a plane rides
 * the draw-head, and the four journey steps light up in sequence — so the
 * process reads as one continuous flight rather than four static cards.
 *
 * Driven by a scroll-progress hook (not GSAP pinning): sticky + a rAF-throttled
 * scroll listener is robust, needs no pin-spacer DOM surgery, and degrades
 * gracefully. Under prefers-reduced-motion the section collapses to normal
 * height with the arc fully drawn and every step shown — no scrubbing.
 *
 * Self-contained: no dependency on the Three.js globe. The plane position is
 * evaluated from the arc's Bézier math (deterministic, SSR-safe — no DOM
 * measurement), and coordinates are rounded so server/client markup matches.
 */

import { useEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useLang, type DictKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const STEP_KEYS: DictKey[] = ['how.step1', 'how.step2', 'how.step3', 'how.step4'];
// Progress thresholds where each step lights up (and where its node sits on
// the arc). The last is just shy of 1 so it settles before the scene releases.
const STEP_T = [0.08, 0.38, 0.68, 0.96];

/* Quadratic Bézier route in the 0..1000 × 0..500 viewBox. */
const P0 = { x: 140, y: 380 }; // Phnom Penh
const P1 = { x: 500, y: 40 };  // lifted control point
const P2 = { x: 860, y: 150 }; // destination
const round2 = (n: number) => Math.round(n * 100) / 100;
const PATH = `M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`;

function bezier(t: number) {
  const u = 1 - t;
  return {
    x: round2(u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x),
    y: round2(u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y),
  };
}
function bezierAngle(t: number) {
  const u = 1 - t;
  const dx = 2 * u * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
  const dy = 2 * u * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  return round2((Math.atan2(dy, dx) * 180) / Math.PI);
}

export function JourneyNarrative() {
  const { t } = useLang();
  const reduce = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLElement>(null);
  const rawProgress = useScrollProgress(wrapRef);
  const progress = reduce ? 1 : rawProgress;

  const head = bezier(progress);
  const headAngle = bezierAngle(progress);
  const activeCount = STEP_T.filter((th) => progress >= th - 0.02).length;

  return (
    <section
      id="how-it-works"
      ref={wrapRef}
      className="relative bg-[linear-gradient(180deg,#14263F_0%,#0E1B30_100%)]"
      style={{ height: reduce ? 'auto' : '320vh' }}
    >
      <div
        className={cn(
          'relative overflow-hidden',
          reduce ? 'py-20' : 'sticky top-0 flex h-screen flex-col justify-center'
        )}
      >
        <div className="stars-far" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading dark eyebrow={t('how.eyebrow')} title={t('how.title')} />
          </Reveal>

          {/* ── The drawing route ── */}
          <div className="relative">
            <svg viewBox="0 0 1000 500" className="mx-auto max-h-[46vh] w-full max-w-4xl" aria-hidden="true">
              <defs>
                <linearGradient id="jn-arc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#C69749" />
                  <stop offset="100%" stopColor="#F7EAC0" />
                </linearGradient>
                <filter id="jn-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* faint full route so the destination is always hinted */}
              <path d={PATH} fill="none" stroke="rgba(230,203,139,0.16)" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />

              {/* the arc that draws itself (pathLength=1 → dashoffset is 1-progress) */}
              <path
                d={PATH}
                fill="none"
                stroke="url(#jn-arc)"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={round2(1 - progress)}
              />

              {/* step nodes along the arc */}
              {STEP_T.map((th, i) => {
                const pt = bezier(th);
                const on = progress >= th - 0.02;
                return (
                  <g key={i}>
                    <circle cx={pt.x} cy={pt.y} r={on ? 9 : 6} fill={on ? '#F7EAC0' : '#2a3d5c'} stroke="rgba(230,203,139,0.6)" strokeWidth="1.5" style={{ transition: 'r 0.3s, fill 0.3s' }} filter={on ? 'url(#jn-glow)' : undefined} />
                    <text x={pt.x} y={pt.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={on ? '#14263F' : '#7d8ba5'}>{i + 1}</text>
                  </g>
                );
              })}

              {/* origin (Phnom Penh) */}
              <circle cx={P0.x} cy={P0.y} r="6" fill="#F7EAC0" filter="url(#jn-glow)" />
              <text x={P0.x} y={P0.y + 26} textAnchor="middle" fontSize="15" fontWeight="600" fill="#E6CB8B" className="font-display">Phnom Penh</text>

              {/* destination */}
              <text x={P2.x} y={P2.y - 18} textAnchor="middle" fontSize="15" fontWeight="600" fill="#F7EAC0" className="font-display">{t('how.eyebrow') && 'Your destination'}</text>

              {/* travelling plane at the draw-head */}
              <g transform={`translate(${head.x} ${head.y}) rotate(${headAngle})`} filter="url(#jn-glow)" style={{ transition: reduce ? undefined : 'transform 0.08s linear' }}>
                <path d="M14 0 L-9 -7 L-3 0 L-9 7 Z" fill="#FFFDF4" />
              </g>
            </svg>
          </div>

          {/* ── Step captions that light up in sync ── */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
            {STEP_KEYS.map((key, i) => {
              const on = i < activeCount;
              return (
                <div key={key} className={cn('flex flex-col items-center text-center transition-all duration-500', on ? 'opacity-100' : 'opacity-35')}>
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-full border font-display text-sm font-bold transition-all duration-500', on ? 'border-primary-deep bg-[linear-gradient(160deg,#F7EAC0,#C69749)] text-primary-deep shadow-[0_4px_16px_rgba(198,151,73,0.45)]' : 'border-white/15 bg-white/5 text-white/50')}>
                    {i + 1}
                  </div>
                  <p className={cn('mt-3 max-w-[190px] text-sm font-medium transition-colors duration-500', on ? 'text-white' : 'text-white/50')}>{t(key)}</p>
                </div>
              );
            })}
          </div>

          {/* scroll hint (only before the scene starts drawing) */}
          {!reduce && (
            <div className={cn('pointer-events-none mt-8 flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-gold-light/70 transition-opacity duration-500', progress > 0.03 ? 'opacity-0' : 'opacity-100')}>
              <span className="h-4 w-px animate-pulse-soft bg-gold-light/70" />
              {t('how.eyebrow') ? 'Scroll to fly' : ''}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── hooks ───────────────────────── */

/** Progress (0..1) of the section through the viewport while its sticky child
 *  is pinned — 0 as the top hits the top, 1 when the last screen scrolls past. */
function useScrollProgress(ref: React.RefObject<HTMLElement>): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) {
        setProgress(1);
        return;
      }
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      setProgress(scrolled / total);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref]);
  return progress;
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}
