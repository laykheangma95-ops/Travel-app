'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Cambodia portrait 3D slideshow.
//
// A premium, "Chamonix-style" 3D card carousel that promotes Cambodian travel
// destinations as tall portrait cards floating in real 3D perspective. It:
//   • keeps the active card centered, upright and full-scale,
//   • fans the neighbouring cards to the sides with a rotateY tilt + downscale,
//   • can be dragged / swiped between cards with spring-snap physics,
//   • lets you tap a side card (or ◀ ▶ / the dots) to bring it to the front,
//   • lazily fades each card in from depth on first paint,
//   • honours prefers-reduced-motion (no idle float, no Ken Burns, plain fades).
//
// It is fully self-contained — the "hero photo" of each card is a rich, layered
// CSS gradient evoking the place, so the section always renders with no images
// or external services. Styling hooks live in app/globals.css under ".slide-*".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin, ArrowRight, Clock, Ticket, Star } from 'lucide-react';
import { useLang } from '@/lib/i18n';

interface Stat {
  icon: 'clock' | 'ticket' | 'star';
  label: string;
  labelKm: string;
}

interface Destination {
  emoji: string;
  name: string;
  nameKm: string;
  region: string;
  regionKm: string;
  badge: string;
  badgeKm: string;
  badgeEmoji: string;
  tagline: string;
  taglineKm: string;
  stats: Stat[];
  gradient: string;
}

// The three signature destinations from the design brief. Each card's "photo"
// is a layered gradient evoking the place — temple gold, riverside navy,
// island turquoise — so the section renders instantly with no image payload.
const DESTINATIONS: Destination[] = [
  {
    emoji: '🛕',
    name: 'Angkor Wat', nameKm: 'អង្គរវត្ត',
    region: 'Siem Reap', regionKm: 'សៀមរាប',
    badge: 'UNESCO Site', badgeKm: 'បេតិកភណ្ឌ UNESCO', badgeEmoji: '🏛️',
    tagline: 'Ancient wonder of the world.', taglineKm: 'អច្ឆរិយភាពបុរាណនៃពិភពលោក។',
    stats: [
      { icon: 'clock', label: 'Full day', labelKm: 'ពេញមួយថ្ងៃ' },
      { icon: 'ticket', label: '$37', labelKm: '$37' },
      { icon: 'star', label: '5.0', labelKm: '5.0' },
    ],
    gradient:
      'radial-gradient(140% 120% at 28% 12%, #F7EAC0 0%, #D9B15E 30%, #9A6E2B 60%, #4A3312 100%)',
  },
  {
    emoji: '🏙️',
    name: 'Phnom Penh', nameKm: 'ភ្នំពេញ',
    region: 'Capital', regionKm: 'រាជធានី',
    badge: 'Capital City', badgeKm: 'រាជធានី', badgeEmoji: '👑',
    tagline: 'Riverside energy meets royal heritage.', taglineKm: 'មាត់ទន្លេរស់រវើក និងបេតិកភណ្ឌរាជវង្ស។',
    stats: [
      { icon: 'clock', label: '2–3 days', labelKm: '2–3 ថ្ងៃ' },
      { icon: 'ticket', label: 'Free', labelKm: 'ឥតគិតថ្លៃ' },
      { icon: 'star', label: '4.7', labelKm: '4.7' },
    ],
    gradient:
      'radial-gradient(140% 120% at 28% 12%, #7FC8DA 0%, #35618C 32%, #1C3355 62%, #0B1626 100%)',
  },
  {
    emoji: '🏝️',
    name: 'Koh Rong', nameKm: 'កោះរុង',
    region: 'Islands', regionKm: 'កោះ',
    badge: 'Island Paradise', badgeKm: 'ឋានសួគ៌កោះ', badgeEmoji: '🏝️',
    tagline: 'Pristine beaches & bioluminescence.', taglineKm: 'ឆ្នេរស្អាតបរិសុទ្ធ និងភ្លុកតុងភ្លឺ។',
    stats: [
      { icon: 'clock', label: '3–4 days', labelKm: '3–4 ថ្ងៃ' },
      { icon: 'ticket', label: '$20', labelKm: '$20' },
      { icon: 'star', label: '4.9', labelKm: '4.9' },
    ],
    gradient:
      'radial-gradient(140% 120% at 28% 12%, #8FF0DE 0%, #29B3AE 32%, #147E82 62%, #0A4247 100%)',
  },
];

const N = DESTINATIONS.length;
const STAT_ICON = { clock: Clock, ticket: Ticket, star: Star } as const;

// Responsive card + fan geometry, derived from the viewport width.
function geometryFor(width: number) {
  if (width < 480) return { card: 250, spread: 150, height: 500 };
  if (width < 768) return { card: 280, spread: 190, height: 540 };
  return { card: 300, spread: 240, height: 560 };
}

// Where a card sits given its distance (in card-units) from the active one.
// Positive `offset` = to the right of centre. Fractional during a live drag.
function placement(offset: number, spread: number) {
  const mag = Math.min(Math.abs(offset), 3);
  const x = offset * spread;
  const rotateY = Math.max(-18, Math.min(18, -offset * 15));
  const scale = Math.max(0.62, 1 - mag * 0.15);
  const opacity = mag <= 1 ? 1 : Math.max(0, 1 - (mag - 1) * 0.4);
  const z = 20 - Math.round(mag * 5);
  return { x, rotateY, scale, opacity, z };
}

export function CambodiaShowcase() {
  const { lang } = useLang();
  const km = lang === 'km';

  const stageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [geo, setGeo] = useState({ card: 300, spread: 240, height: 560 });
  const [dragPx, setDragPx] = useState(0); // live horizontal drag, pixels
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  const drag = useRef<{ startX: number; startPx: number; active: boolean }>({
    startX: 0, startPx: 0, active: false,
  });

  // Measure viewport for responsive geometry + reduced-motion preference.
  useEffect(() => {
    const measure = () => setGeo(geometryFor(window.innerWidth));
    measure();
    window.addEventListener('resize', measure);
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Kick off the entrance animation on the next frame.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, []);

  const goTo = useCallback((index: number) => {
    setActive(Math.max(0, Math.min(N - 1, index)));
  }, []);
  const next = useCallback(() => setActive((a) => Math.min(N - 1, a + 1)), []);
  const prev = useCallback(() => setActive((a) => Math.max(0, a - 1)), []);

  // Pointer drag / swipe between cards.
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, startPx: 0, active: true };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    let dx = e.clientX - drag.current.startX;
    // Elastic resistance at the first / last card.
    if ((active === 0 && dx > 0) || (active === N - 1 && dx < 0)) dx *= 0.35;
    setDragPx(dx);
  };
  const endDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    // Snap: a drag past ~⅓ of the fan spacing advances one card.
    const steps = Math.round(-dragPx / (geo.spread * 0.9));
    if (steps !== 0) goTo(active + steps);
    setDragPx(0);
  };

  // Keyboard navigation on the stage.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  };

  const current = DESTINATIONS[active];
  // Live fractional shift while dragging, in card-units.
  const dragOffset = dragPx / geo.spread;
  const transition = dragging
    ? 'none'
    : 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease';

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0A1628_0%,#14263F_48%,#1C3355_100%)] py-20 sm:py-28">
      {/* Ambient starfield + gold aura + drifting fog, matching the hero */}
      <div className="stars" aria-hidden="true" />
      <div className="slide-fog" aria-hidden="true" />
      <div
        className="slide-aura pointer-events-none absolute left-1/2 top-[46%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(198,151,73,0.26)_0%,rgba(198,151,73,0.07)_42%,transparent_70%)]"
        aria-hidden="true"
      />

      {/* Scroll / carousel progress bar */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-white/5" aria-hidden="true">
        <div
          className="slide-progress h-full bg-gradient-to-r from-gold-bright via-gold-light to-accent"
          style={{ width: `${((active + 1) / N) * 100}%` }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Heading */}
        <div className="text-center">
          <span className="liquid-glass liquid-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide text-white">
            <MapPin size={13} className="text-gold-light" aria-hidden="true" />
            {km ? 'ស្វែងរកប្រទេសកម្ពុជា' : 'Discover Cambodia'}
          </span>
          <h2 className="mt-6 font-display text-5xl font-extrabold tracking-[-0.02em] text-white sm:text-6xl">
            <span className="slide-title-glow bg-gradient-to-r from-gold-bright via-gold-light to-accent bg-clip-text text-transparent">
              {km ? 'កម្ពុជា' : 'CAMBODIA'}
            </span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg font-light text-white/70">
            {km ? 'អច្ឆរិយភាពកំពុងរង់ចាំ' : 'The Wonders Await'}
          </p>
        </div>

        {/* 3D portrait stage */}
        <div
          ref={stageRef}
          className="slide-stage relative mx-auto mt-12 flex select-none items-center justify-center"
          style={{ height: geo.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label={km ? 'គោលដៅកម្ពុជា' : 'Cambodia destinations'}
        >
          {/* Arrow buttons */}
          <button
            type="button"
            onClick={prev}
            disabled={active === 0}
            aria-label={km ? 'គោលដៅមុន' : 'Previous destination'}
            className="liquid-glass liquid-sheen absolute left-1 z-30 flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 sm:left-4"
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={active === N - 1}
            aria-label={km ? 'គោលដៅបន្ទាប់' : 'Next destination'}
            className="liquid-glass liquid-sheen absolute right-1 z-30 flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 sm:right-4"
          >
            <ChevronRight size={24} aria-hidden="true" />
          </button>

          {DESTINATIONS.map((d, i) => {
            const offset = i - active - dragOffset;
            const p = placement(offset, geo.spread);
            const isActive = i === active && Math.abs(dragOffset) < 0.5;
            const hidden = Math.abs(offset) > 2.4;
            return (
              <article
                key={d.name}
                aria-hidden={!isActive}
                className="slide-card absolute"
                data-active={isActive}
                data-mounted={mounted}
                style={{
                  width: geo.card,
                  height: geo.card * 1.5,
                  transform: `translateX(${p.x}px) scale(${p.scale}) rotateY(${p.rotateY}deg)`,
                  opacity: hidden ? 0 : p.opacity,
                  zIndex: p.z,
                  transition,
                  pointerEvents: hidden ? 'none' : 'auto',
                  // Staggered entrance from depth.
                  transitionDelay: mounted ? '0ms' : `${600 + Math.abs(i - 0) * 150}ms`,
                }}
                onClick={() => { if (!isActive && Math.abs(dragPx) < 6) goTo(i); }}
              >
                {/* Hero "photo" — layered gradient with a slow Ken Burns zoom */}
                <div className="slide-photo" style={{ background: d.gradient }}>
                  <span className="slide-photo-emoji" aria-hidden="true">{d.emoji}</span>
                  <div className="slide-photo-scrim" aria-hidden="true" />

                  {/* Location badge — glassmorphism, top-left */}
                  <span className="slide-badge">
                    <span aria-hidden="true">{d.badgeEmoji}</span>
                    {km ? d.badgeKm : d.badge}
                  </span>
                </div>

                {/* Title + region, overlaid on the photo bottom */}
                <div className="slide-titleblock">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold-light">
                    {km ? d.regionKm : d.region}
                  </p>
                  <h3 className="mt-1 font-display text-[26px] font-bold leading-tight text-white">
                    {km ? d.nameKm : d.name}
                  </h3>
                </div>

                {/* Info panel — stats, tagline, CTA */}
                <div className="slide-info">
                  <div className="flex items-center gap-4">
                    {d.stats.map((s) => {
                      const Icon = STAT_ICON[s.icon];
                      return (
                        <span key={s.label} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/80">
                          <Icon size={14} className="text-gold-light" aria-hidden="true" />
                          {km ? s.labelKm : s.label}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                    {km ? d.taglineKm : d.tagline}
                  </p>
                  <Link
                    href="/esim"
                    tabIndex={isActive ? 0 : -1}
                    className="slide-cta group mt-4 inline-flex items-center justify-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {km ? 'ស្វែងរក' : 'Explore'}
                    <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {/* Navigation dots */}
        <div className="mt-10 flex items-center justify-center gap-2.5" role="tablist" aria-label={km ? 'គោលដៅ' : 'Destinations'}>
          {DESTINATIONS.map((d, i) => (
            <button
              key={d.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={km ? d.nameKm : d.name}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all duration-200 ${
                i === active ? 'w-6 bg-gold-light' : 'w-2 bg-white/30 hover:bg-white/55'
              }`}
            />
          ))}
        </div>

        {/* Section CTA */}
        <div className="mt-12 text-center">
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
