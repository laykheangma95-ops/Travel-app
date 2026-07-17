'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Cambodia 3D Liquid-Glass destination showcase.
//
// A premium coverflow of tall glass destination cards on a real 3D ring — the
// front card faces the viewer while its neighbours tilt away to the sides.
// Each card carries a category badge, a large emoji, the destination name,
// a meta row (duration · price · rating), a tagline, and a gold Explore pill.
// The ring:
//   • auto-rotates continuously (pauses when hovered or touched),
//   • can be dragged / swiped to spin,
//   • snaps to the nearest card and highlights the front one,
//   • lets you tap a card (or the dots) to bring it to the front,
//   • honours prefers-reduced-motion (no auto-spin, no idle float).
//
// It is fully self-contained — no images or external services — so it always
// renders. Styling hooks live in app/globals.css under ".cam-*".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight, Clock, Ticket, Star } from 'lucide-react';
import { useLang } from '@/lib/i18n';

interface Destination {
  emoji: string;
  name: string;
  nameKm: string;
  region: string;
  regionKm: string;
  tagline: string;
  taglineKm: string;
  gradient: string;
  badgeEmoji: string;
  badge: string;
  badgeKm: string;
  chip: string; // badge pill tint, pale enough for dark navy text
  duration: string;
  durationKm: string;
  price: string;
  priceKm: string;
  rating: number;
}

// Eight signature Cambodian destinations. Each card is a rich radial gradient
// evoking the place — temple gold, island turquoise, highland green.
const DESTINATIONS: Destination[] = [
  {
    emoji: '🛕', name: 'Angkor Wat', nameKm: 'អង្គរវត្ត', region: 'Siem Reap', regionKm: 'សៀមរាប',
    tagline: 'The soul of a nation, carved in stone.', taglineKm: 'ព្រលឹងជាតិ ឆ្លាក់លើថ្ម។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #F7EAC0 0%, #C69749 42%, #6B4E1E 100%)',
    badgeEmoji: '🏛️', badge: 'UNESCO Heritage', badgeKm: 'បេតិកភណ្ឌ UNESCO', chip: '#F1E3BC',
    duration: '1–3 days', durationKm: '1–3 ថ្ងៃ', price: '$37', priceKm: '$37', rating: 4.9,
  },
  {
    emoji: '🏙️', name: 'Phnom Penh', nameKm: 'ភ្នំពេញ', region: 'Capital', regionKm: 'រាជធានី',
    tagline: 'Riverside energy meets royal heritage.', taglineKm: 'មាត់ទន្លេរស់រវើក និងបេតិកភណ្ឌរាជវង្ស។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #7FC8DA 0%, #1C3355 55%, #0E1B30 100%)',
    badgeEmoji: '👑', badge: 'Capital', badgeKm: 'រាជធានី', chip: '#A9D3F0',
    duration: '2–3 days', durationKm: '2–3 ថ្ងៃ', price: 'Free', priceKm: 'ឥតគិតថ្លៃ', rating: 4.7,
  },
  {
    emoji: '🏝️', name: 'Koh Rong', nameKm: 'កោះរុង', region: 'Islands', regionKm: 'កោះ',
    tagline: 'White sand by day, glowing plankton by night.', taglineKm: 'ខ្សាច់សរពេលថ្ងៃ ភ្លុកតុងភ្លឺពេលយប់។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #8FF0DE 0%, #1FA3A3 52%, #0E5B63 100%)',
    badgeEmoji: '⛵', badge: 'Islands', badgeKm: 'កោះ', chip: '#A9F0DF',
    duration: '2–4 days', durationKm: '2–4 ថ្ងៃ', price: '$20', priceKm: '$20', rating: 4.9,
  },
  {
    emoji: '🌿', name: 'Kampot', nameKm: 'កំពត', region: 'Riverlands', regionKm: 'តំបន់ទន្លេ',
    tagline: 'Pepper farms and slow river sunsets.', taglineKm: 'ចម្ការម្រេច និងថ្ងៃលិចលើទន្លេ។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #C4E88F 0%, #4E8B3B 52%, #1E3A1E 100%)',
    badgeEmoji: '🌶️', badge: 'Riverlands', badgeKm: 'តំបន់ទន្លេ', chip: '#CBEBA4',
    duration: '2–3 days', durationKm: '2–3 ថ្ងៃ', price: 'Free', priceKm: 'ឥតគិតថ្លៃ', rating: 4.6,
  },
  {
    emoji: '🌊', name: 'Sihanoukville', nameKm: 'ក្រុងព្រះសីហនុ', region: 'The Coast', regionKm: 'ឆ្នេរសមុទ្រ',
    tagline: 'Gulf-of-Thailand beaches and island ferries.', taglineKm: 'ឆ្នេរឈូងសមុទ្រថៃ និងសំពៅទៅកោះ។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #8FD0F5 0%, #2A6FB0 52%, #123A63 100%)',
    badgeEmoji: '⛴️', badge: 'The Coast', badgeKm: 'ឆ្នេរសមុទ្រ', chip: '#A5D6F5',
    duration: '1–2 days', durationKm: '1–2 ថ្ងៃ', price: '$5', priceKm: '$5', rating: 4.4,
  },
  {
    emoji: '🎨', name: 'Battambang', nameKm: 'បាត់ដំបង', region: 'Arts & Rice', regionKm: 'សិល្បៈ',
    tagline: 'Colonial charm and the famous bamboo train.', taglineKm: 'ស្ថាបត្យកម្មបុរាណ និងរថភ្លើងឫស្សីដ៏ល្បី។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #F5CE86 0%, #C6853A 52%, #6B3E1E 100%)',
    badgeEmoji: '🚂', badge: 'Arts & Rice', badgeKm: 'សិល្បៈ', chip: '#F3D9A8',
    duration: '1–2 days', durationKm: '1–2 ថ្ងៃ', price: '$10', priceKm: '$10', rating: 4.6,
  },
  {
    emoji: '🦀', name: 'Kep', nameKm: 'កែប', region: 'Seaside', regionKm: 'តាមឆ្នេរ',
    tagline: 'The legendary crab market by the sea.', taglineKm: 'ផ្សារក្ដាមល្បីល្បាញនៅមាត់សមុទ្រ។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #F7B79A 0%, #D65A3A 52%, #7A2A1E 100%)',
    badgeEmoji: '🦞', badge: 'Seaside', badgeKm: 'តាមឆ្នេរ', chip: '#F6C6AE',
    duration: '1–2 days', durationKm: '1–2 ថ្ងៃ', price: '$8', priceKm: '$8', rating: 4.5,
  },
  {
    emoji: '🐘', name: 'Mondulkiri', nameKm: 'មណ្ឌលគិរី', region: 'Highlands', regionKm: 'ខ្ពង់រាប',
    tagline: 'Misty hills and ethical elephant sanctuaries.', taglineKm: 'ភ្នំអ័ព្ទ និងជម្រកដំរីប្រកបដោយក្រមសីលធម៌។',
    gradient: 'radial-gradient(125% 125% at 30% 18%, #9AE0B3 0%, #2F7A4E 52%, #123A24 100%)',
    badgeEmoji: '🌄', badge: 'Highlands', badgeKm: 'ខ្ពង់រាប', chip: '#B7E8C8',
    duration: '2–3 days', durationKm: '2–3 ថ្ងៃ', price: '$45', priceKm: '$45', rating: 4.8,
  },
];

const N = DESTINATIONS.length;
const STEP = 360 / N; // degrees between adjacent cards on the ring
const AUTO_SPEED = 0.1; // degrees per frame when idle-spinning

// Responsive ring geometry, derived from the viewport width.
function geometryFor(width: number) {
  if (width < 480) return { w: 236, h: 372, radius: 320, height: 430 };
  if (width < 768) return { w: 264, h: 396, radius: 360, height: 460 };
  return { w: 304, h: 424, radius: 440, height: 500 };
}

export function CambodiaShowcase() {
  const { lang } = useLang();
  const km = lang === 'km';

  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0); // current ring rotation, degrees
  const snapRef = useRef<number | null>(null); // eased target, or null
  const autoRef = useRef(true); // idle auto-spin on?
  const dragRef = useRef<{ startX: number; startRot: number; active: boolean; moved: boolean }>({
    startX: 0, startRot: 0, active: false, moved: false,
  });
  const activeRef = useRef(0);
  const reducedRef = useRef(false);

  const [active, setActive] = useState(0);
  const [geo, setGeo] = useState({ w: 304, h: 424, radius: 440, height: 500 });

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

      // Which card faces the viewer?
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
    const current = rotationRef.current;
    // Choose the nearest co-terminal angle to avoid a long spin.
    const delta = ((target - current + 540) % 360) - 180;
    snapRef.current = current + delta;
    autoRef.current = false;
  }, []);

  // Pointer drag / swipe to spin.
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startRot: rotationRef.current, active: true, moved: false };
    snapRef.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    if (Math.abs(e.clientX - drag.startX) > 8) drag.moved = true;
    rotationRef.current = drag.startRot + (e.clientX - drag.startX) * 0.35;
  };
  const endDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    // Snap to the nearest card; resume auto-spin only if not reduced-motion.
    snapRef.current = Math.round(rotationRef.current / STEP) * STEP;
    if (!reducedRef.current) autoRef.current = true;
  };

  // After a real drag, swallow the click so cards/links don't fire.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  };

  const pauseAuto = () => { if (!dragRef.current.active) autoRef.current = false; };
  const resumeAuto = () => { if (!reducedRef.current && !dragRef.current.active && snapRef.current === null) autoRef.current = true; };

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_45%,#1C3355_100%)] pb-20 pt-5 sm:pb-28 sm:pt-8">
      {/* Ambient starfield + gold aura, matching the hero */}
      <div className="stars" aria-hidden="true" />
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

        {/* 3D coverflow stage */}
        <div
          ref={stageRef}
          className="cam-stage relative mx-auto mt-12 select-none"
          style={{ height: geo.height, maxWidth: geo.radius * 2 + geo.w + 40 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onClickCapture={onClickCapture}
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
                      width: geo.w,
                      height: geo.h,
                      // translate(-50%,-50%) centers the card; then place it on the ring.
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
                    <article
                      className="cam-card flex flex-col p-5 text-left sm:p-6"
                      style={{ background: d.gradient }}
                    >
                      {/* Category badge */}
                      <span
                        className="relative z-[2] inline-flex items-center gap-1.5 self-start rounded-full px-3.5 py-1.5 text-xs font-bold text-[#14263F] shadow-[0_4px_12px_rgba(2,8,23,0.35)]"
                        style={{ background: d.chip }}
                      >
                        <span aria-hidden="true">{d.badgeEmoji}</span>
                        {km ? d.badgeKm : d.badge}
                      </span>

                      {/* Big emoji, floating right of the name block */}
                      <div className="relative z-[2] flex flex-1 items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-bright [text-shadow:0_2px_8px_rgba(0,0,0,0.6)]">
                            {km ? d.regionKm : d.region}
                          </p>
                          <h3 className="mt-1 font-display text-3xl font-extrabold leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.55)] sm:text-4xl">
                            {km ? d.nameKm : d.name}
                          </h3>
                        </div>
                        <span className="cam-emoji shrink-0 text-5xl sm:text-6xl" aria-hidden="true">
                          {d.emoji}
                        </span>
                      </div>

                      {/* Meta row: duration · price · rating */}
                      <div className="relative z-[2] mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={14} className="text-gold-bright" aria-hidden="true" />
                          {km ? d.durationKm : d.duration}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Ticket size={14} className="text-gold-bright" aria-hidden="true" />
                          {km ? d.priceKm : d.price}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Star size={14} className="fill-gold-bright text-gold-bright" aria-hidden="true" />
                          {d.rating.toFixed(1)}
                        </span>
                      </div>

                      {/* Tagline */}
                      <p className="relative z-[2] mt-2 line-clamp-2 text-sm leading-relaxed text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
                        {km ? d.taglineKm : d.tagline}
                      </p>

                      {/* Per-card gold Explore pill */}
                      <Link
                        href="/esim"
                        onClick={(e) => e.stopPropagation()}
                        tabIndex={isActive ? 0 : -1}
                        className="liquid-glass-accent liquid-sheen relative z-[2] mt-4 inline-flex items-center gap-2 self-start rounded-full px-5 py-2.5 font-display text-sm font-bold text-[#3A2A08] transition-transform duration-200 hover:scale-105 active:scale-95"
                      >
                        {km ? 'ស្វែងរក' : 'Explore'}
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dots — the active one stretches into a gold bar */}
        <div className="mt-8 flex items-center justify-center gap-2" role="tablist" aria-label="Destinations">
          {DESTINATIONS.map((d, i) => (
            <button
              key={d.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={d.name}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === active ? 'w-8 bg-gold-light' : 'w-2 bg-white/25 hover:bg-white/50'
              }`}
            />
          ))}
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
