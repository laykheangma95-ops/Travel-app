'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Cambodia 3D Liquid-Glass destination showcase.
//
// A premium, Apple-style carousel that promotes Cambodian travel destinations as
// gold-rimmed glass "profile" medallions arranged on a real 3D ring. It:
//   • auto-rotates continuously (pauses when hovered or touched),
//   • can be dragged / swiped to spin,
//   • snaps to the nearest medallion and highlights the front one,
//   • lets you tap a medallion (or ◀ ▶ / the dots) to bring it to the front,
//   • cross-fades a bilingual caption for whichever destination is in focus,
//   • honours prefers-reduced-motion (no auto-spin, no idle float).
//
// It is fully self-contained — no images or external services — so it always
// renders. Styling hooks live in app/globals.css under ".cam-*".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin, ArrowRight } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { DestinationArt } from '@/components/home/destinationArt';

interface Destination {
  name: string;
  nameKm: string;
  region: string;
  regionKm: string;
  tagline: string;
  taglineKm: string;
  gradient: string;
}

// Eight signature Cambodian destinations. Each medallion pairs a rich radial
// gradient "sky" with a bespoke SVG scene (see destinationArt.tsx) — temple
// gold, island turquoise, highland green — no emoji placeholders.
const DESTINATIONS: Destination[] = [
  {
    name: 'Angkor Wat', nameKm: 'អង្គរវត្ត', region: 'Siem Reap', regionKm: 'សៀមរាប',
    tagline: 'The soul of a nation, carved in stone.', taglineKm: 'ព្រលឹងជាតិ ឆ្លាក់លើថ្ម។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #F7EAC0 0%, #C69749 42%, #6B4E1E 100%)',
  },
  {
    name: 'Phnom Penh', nameKm: 'ភ្នំពេញ', region: 'Capital', regionKm: 'រាជធានី',
    tagline: 'Riverside energy meets royal heritage.', taglineKm: 'មាត់ទន្លេរស់រវើក និងបេតិកភណ្ឌរាជវង្ស។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #7FC8DA 0%, #1C3355 55%, #0E1B30 100%)',
  },
  {
    name: 'Koh Rong', nameKm: 'កោះរុង', region: 'Islands', regionKm: 'កោះ',
    tagline: 'White sand by day, glowing plankton by night.', taglineKm: 'ខ្សាច់សរពេលថ្ងៃ ភ្លុកតុងភ្លឺពេលយប់។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #8FF0DE 0%, #1FA3A3 52%, #0E5B63 100%)',
  },
  {
    name: 'Kampot', nameKm: 'កំពត', region: 'Riverlands', regionKm: 'តំបន់ទន្លេ',
    tagline: 'Pepper farms and slow river sunsets.', taglineKm: 'ចម្ការម្រេច និងថ្ងៃលិចលើទន្លេ។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #C4E88F 0%, #4E8B3B 52%, #1E3A1E 100%)',
  },
  {
    name: 'Sihanoukville', nameKm: 'ក្រុងព្រះសីហនុ', region: 'The Coast', regionKm: 'ឆ្នេរសមុទ្រ',
    tagline: 'Gulf-of-Thailand beaches and island ferries.', taglineKm: 'ឆ្នេរឈូងសមុទ្រថៃ និងសំពៅទៅកោះ។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #8FD0F5 0%, #2A6FB0 52%, #123A63 100%)',
  },
  {
    name: 'Battambang', nameKm: 'បាត់ដំបង', region: 'Arts & Rice', regionKm: 'សិល្បៈ',
    tagline: 'Colonial charm and the famous bamboo train.', taglineKm: 'ស្ថាបត្យកម្មបុរាណ និងរថភ្លើងឫស្សីដ៏ល្បី។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #F5CE86 0%, #C6853A 52%, #6B3E1E 100%)',
  },
  {
    name: 'Kep', nameKm: 'កែប', region: 'Seaside', regionKm: 'តាមឆ្នេរ',
    tagline: 'The legendary crab market by the sea.', taglineKm: 'ផ្សារក្ដាមល្បីល្បាញនៅមាត់សមុទ្រ។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #F7B79A 0%, #D65A3A 52%, #7A2A1E 100%)',
  },
  {
    name: 'Mondulkiri', nameKm: 'មណ្ឌលគិរី', region: 'Highlands', regionKm: 'ខ្ពង់រាប',
    tagline: 'Misty hills and ethical elephant sanctuaries.', taglineKm: 'ភ្នំអ័ព្ទ និងជម្រកដំរីប្រកបដោយក្រមសីលធម៌។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #9AE0B3 0%, #2F7A4E 52%, #123A24 100%)',
  },
];

const N = DESTINATIONS.length;
const STEP = 360 / N; // degrees between adjacent medallions on the ring
const AUTO_SPEED = 0.12; // degrees per frame when idle-spinning

// Responsive ring geometry, derived from the viewport width.
function geometryFor(width: number) {
  if (width < 480) return { item: 104, radius: 158, height: 300 };
  if (width < 768) return { item: 128, radius: 232, height: 360 };
  return { item: 152, radius: 300, height: 430 };
}

export function CambodiaShowcase() {
  const { lang } = useLang();
  const km = lang === 'km';

  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0); // current ring rotation, degrees
  const snapRef = useRef<number | null>(null); // eased target, or null
  const autoRef = useRef(true); // idle auto-spin on?
  const dragRef = useRef<{ startX: number; startRot: number; active: boolean }>({
    startX: 0, startRot: 0, active: false,
  });
  const activeRef = useRef(0);
  const reducedRef = useRef(false);

  const [active, setActive] = useState(0);
  const [geo, setGeo] = useState({ item: 152, radius: 300, height: 430 });

  // Measure the viewport for responsive geometry.
  useEffect(() => {
    const measure = () => setGeo(geometryFor(window.innerWidth));
    measure();
    window.addEventListener('resize', measure);
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedRef.current) autoRef.current = false;
    return () => window.removeEventListener('resize', measure);
  }, []);

  // The animation loop — the single source of truth for the ring's rotation.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const drag = dragRef.current;
      if (!drag.active) {
        if (snapRef.current !== null) {
          // Ease toward the snap target, then settle.
          const diff = snapRef.current - rotationRef.current;
          if (Math.abs(diff) < 0.05) {
            rotationRef.current = snapRef.current;
            snapRef.current = null;
          } else {
            rotationRef.current += diff * 0.12;
          }
        } else if (autoRef.current) {
          rotationRef.current -= AUTO_SPEED;
        }
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `translateZ(-${geo.radius}px) rotateY(${rotationRef.current}deg)`;
      }

      // Which medallion faces the viewer?
      const idx = ((Math.round(-rotationRef.current / STEP) % N) + N) % N;
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActive(idx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geo.radius]);

  // Rotate so that `index` lands at the front, taking the shortest path.
  const goTo = useCallback((index: number) => {
    const target = -index * STEP;
    let current = rotationRef.current;
    // Choose the nearest co-terminal angle to avoid a long spin.
    const delta = ((target - current + 540) % 360) - 180;
    snapRef.current = current + delta;
    autoRef.current = false;
  }, []);

  const next = useCallback(() => goTo((activeRef.current + 1) % N), [goTo]);
  const prev = useCallback(() => goTo((activeRef.current - 1 + N) % N), [goTo]);

  // Pointer drag / swipe to spin.
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startRot: rotationRef.current, active: true };
    snapRef.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    rotationRef.current = drag.startRot + (e.clientX - drag.startX) * 0.35;
  };
  const endDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    // Snap to the nearest medallion; resume auto-spin only if not reduced-motion.
    snapRef.current = Math.round(rotationRef.current / STEP) * STEP;
    if (!reducedRef.current) autoRef.current = true;
  };

  const pauseAuto = () => { if (!dragRef.current.active) autoRef.current = false; };
  const resumeAuto = () => { if (!reducedRef.current && !dragRef.current.active && snapRef.current === null) autoRef.current = true; };

  const current = DESTINATIONS[active];

  return (
    // Transparent background: this section sits over the shared globe layer
    // (see .dgh-stage / GlobeHero), so the planet's lower hemisphere shows
    // through with the carousel floating on top.
    <section className="relative z-[1] overflow-hidden py-20 sm:py-28">
      {/* Gold aura behind the carousel (the globe layer provides the starfield) */}
      <div
        className="cam-aura pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(198,151,73,0.28)_0%,rgba(198,151,73,0.08)_40%,transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Heading */}
        <div className="text-center">
          <span className="liquid-glass liquid-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide text-white">
            <MapPin size={13} className="text-gold-light" aria-hidden="true" />
            {km ? 'ស្វែងរកប្រទេសកម្ពុជា' : 'Discover Cambodia'}
          </span>
          <h2 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.02em] text-white sm:text-5xl">
            {km ? 'គោលដៅ​ដ៏​អស្ចារ្យ​របស់​' : 'The wonders of '}
            <span className="bg-gradient-to-r from-gold-bright via-gold-light to-accent bg-clip-text text-transparent">
              {km ? 'កម្ពុជា' : 'Cambodia'}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/60">
            {km
              ? 'អូស ឬ​ចុច​ដើម្បី​បង្វិល​​ការ​ស្វែងរក​គោលដៅ​ដ៏​ស្រស់ស្អាត​របស់​កម្ពុជា។'
              : 'Drag, swipe, or tap to spin through Cambodia’s most beautiful places.'}
          </p>
        </div>

        {/* 3D stage */}
        <div
          ref={stageRef}
          className="cam-stage relative mx-auto mt-10 select-none"
          style={{ height: geo.height, maxWidth: geo.radius * 2 + geo.item + 40 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onMouseEnter={pauseAuto}
          onMouseLeave={resumeAuto}
        >
          <div className="cam-float absolute inset-0">
            <div ref={ringRef} className="cam-ring">
              {DESTINATIONS.map((d, i) => {
                const isActive = i === active;
                return (
                  <div
                    key={d.name}
                    className="cam-item"
                    data-active={isActive}
                    style={{
                      width: geo.item,
                      height: geo.item,
                      // translate(-50%,-50%) centers the medallion; then place it on the ring.
                      transform: `translate(-50%, -50%) rotateY(${i * STEP}deg) translateZ(${geo.radius}px)`,
                    }}
                    onClick={() => goTo(i)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${d.name} — ${d.region}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(i); }
                    }}
                  >
                    <div
                      className="cam-medallion liquid-sheen flex flex-col items-center justify-end transition-transform duration-500"
                      style={{
                        background: d.gradient,
                        transform: isActive ? 'scale(1.12)' : 'scale(1)',
                      }}
                    >
                      {/* Bespoke destination scene fills the medallion behind the label. */}
                      <DestinationArt name={d.name} className="cam-art absolute inset-0 h-full w-full" />
                      {/* Legibility scrim so the label reads over any scene. */}
                      <span className="cam-scrim pointer-events-none absolute inset-x-0 bottom-0 h-1/2" aria-hidden="true" />
                      <span
                        className="cam-caption relative z-[2] px-2 pb-3 text-center font-display font-bold leading-tight text-white"
                        style={{ fontSize: Math.max(10, geo.item * 0.1) }}
                      >
                        {km ? d.nameKm : d.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Active destination caption — cross-fades on change */}
        <div className="relative mt-4 text-center" aria-live="polite">
          <div key={active} className="cam-info-enter mx-auto max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold-light">
              {km ? current.regionKm : current.region}
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {km ? current.nameKm : current.name}
              <span className="ml-2 align-middle text-base font-medium text-white/40">
                {km ? current.name : current.nameKm}
              </span>
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/65">
              {km ? current.taglineKm : current.tagline}
            </p>
          </div>
        </div>

        {/* Controls: prev / dots / next */}
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous destination"
            className="liquid-glass liquid-sheen flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 active:scale-95"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2" role="tablist" aria-label="Destinations">
            {DESTINATIONS.map((d, i) => (
              <button
                key={d.name}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={d.name}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === active ? 'w-7 bg-gold-light' : 'w-2 bg-white/25 hover:bg-white/50'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={next}
            aria-label="Next destination"
            className="liquid-glass liquid-sheen flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 active:scale-95"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <Link
            href="/esim"
            className="liquid-glass-accent liquid-sheen inline-flex items-center gap-2 rounded-full px-7 py-3 font-display text-sm font-bold text-[#3A2A08] shadow-card-hover transition-transform duration-200 hover:scale-105 active:scale-95"
          >
            {km ? 'រៀបចំដំណើរកម្ពុជារបស់អ្នក' : 'Plan your Cambodia trip'}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
