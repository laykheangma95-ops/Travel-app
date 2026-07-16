'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { CambodiaShowcase } from '@/components/home/CambodiaShowcase';
import { popularDestinations } from '@/data/destinations';
import { useLang, type DictKey } from '@/lib/i18n';

const features: { icon: typeof Smartphone; nameKey: DictKey; descKey: DictKey; href: string }[] = [
  { icon: Smartphone, nameKey: 'feature1.name', descKey: 'feature1.desc', href: '/esim' },
  { icon: BellRing, nameKey: 'feature2.name', descKey: 'feature2.desc', href: '/flights' },
  { icon: MapPinned, nameKey: 'feature3.name', descKey: 'feature3.desc', href: '/airport-guide' },
];

const stepKeys: DictKey[] = ['how.step1', 'how.step2', 'how.step3', 'how.step4'];

const testimonials = [
  {
    initials: 'SP',
    name: 'Sokha P.',
    trip: 'Vietnam trip',
    quote: 'eSIM worked perfectly the moment I landed. No more SIM card stress at the airport.',
  },
  {
    initials: 'DM',
    name: 'Dara M.',
    trip: 'Japan trip',
    quote:
      'The gate change notification saved me. I was in the coffee shop and Domer told me before the screen did.',
  },
  {
    initials: 'CS',
    name: 'Channary S.',
    trip: 'Thailand trip',
    quote:
      'First time flying alone. The airport guide told me exactly what to do at each step. I felt safe.',
  },
];

const JET_PATH = 'M21.5 15.5 13.5 11V4.75a1.5 1.5 0 0 0-3 0V11l-8 4.5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13.5 19v-4l8 2.5v-2Z';

export function HomeContent() {
  const { t } = useLang();
  const heroRef = useRef<HTMLElement>(null);

  // Pointer parallax: feed the cursor position into CSS vars; the globe scene
  // drifts with the cursor and the headline drifts gently against it.
  const onHeroPointer = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--par-x', String((e.clientX - rect.left) / rect.width - 0.5));
    el.style.setProperty('--par-y', String((e.clientY - rect.top) / rect.height - 0.5));
  };

  const resetHeroPointer = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty('--par-x', '0');
    el.style.setProperty('--par-y', '0');
  };

  return (
    <>
      {/* ── Hero — living globe with an orbiting flight ── */}
      <section
        ref={heroRef}
        onMouseMove={onHeroPointer}
        onMouseLeave={resetHeroPointer}
        className="relative flex min-h-[100vh] items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_38%,#1C3355_66%,#2A4A7A_84%,#14263F_100%)]"
      >
        {/* Starfield */}
        <div className="stars" aria-hidden="true" />
        <div className="stars-far" aria-hidden="true" />

        {/* Sunrise glow behind the globe */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] animate-globe-glow bg-[radial-gradient(60%_55%_at_50%_100%,rgba(198,151,73,0.22)_0%,rgba(35,64,106,0.20)_45%,transparent_75%)]"
          aria-hidden="true"
        />

        <div className="hero-copy relative z-10 mx-auto max-w-5xl px-4 pb-64 pt-24 text-center sm:px-6 sm:pb-80">
          <span className="liquid-glass liquid-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide text-white animate-fade-up">
            {t('hero.badge')}
          </span>
          <h1 className="mt-8 font-display text-5xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-7xl lg:text-8xl animate-fade-up [animation-delay:100ms]">
            {t('hero.t1')}
            <span className="bg-gradient-to-r from-gold-bright via-gold-light to-accent bg-clip-text text-transparent">
              {' '}
              {t('hero.t2')}
            </span>
            <br />
            {t('hero.t3')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-light leading-relaxed text-white/65 sm:text-xl animate-fade-up [animation-delay:200ms]">
            {t('hero.sub')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up [animation-delay:300ms]">
            <Button href="/esim" variant="liquid-accent" size="lg">
              {t('hero.ctaEsim')}
            </Button>
            <Button href="/flights" variant="liquid" size="lg">
              {t('hero.ctaFlight')}
            </Button>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 animate-fade-up [animation-delay:400ms]">
            {[t('hero.stat1'), t('hero.stat2'), t('hero.stat3')].map((stat) => (
              <span
                key={stat}
                className="liquid-glass rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide text-white/80"
              >
                {stat}
              </span>
            ))}
          </div>
        </div>

        {/* ── Upper hemisphere ─────────────────────────────────────────────
            The crown of a photoreal planet rising from the fold: deep-navy
            sphere, cyan atmosphere rim, drifting city-light surface,
            volumetric beams, and golden fiber-optic routes arcing city to
            city. Its lower half lives at the top of the Cambodia showcase —
            the two sections complete one shared globe across the seam, so
            both halves are pinned (no parallax) to stay perfectly aligned. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex justify-center" aria-hidden="true">
          <div className="w-[900px] shrink-0 sm:w-[1150px]">
            <svg viewBox="0 0 1000 400" fill="none" className="h-auto w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hemiTop" x1="500" y1="40" x2="500" y2="400" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#35608F" />
                  <stop offset="0.45" stopColor="#1B3252" />
                  <stop offset="1" stopColor="#0C1830" />
                </linearGradient>
                <radialGradient id="hemiAtmo" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0.78" stopColor="rgba(110,195,245,0)" />
                  <stop offset="0.86" stopColor="rgba(110,195,245,0.22)" />
                  <stop offset="0.93" stopColor="rgba(160,225,255,0.10)" />
                  <stop offset="1" stopColor="rgba(160,225,255,0)" />
                </radialGradient>
                <linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="rgba(190,228,255,0)" />
                  <stop offset="1" stopColor="rgba(190,228,255,0.55)" />
                </linearGradient>
                <pattern id="hemiDots" width="18" height="16" patternUnits="userSpaceOnUse">
                  <circle cx="3" cy="4" r="1" fill="rgba(150,200,245,0.20)" />
                  <circle cx="12" cy="11" r="0.9" fill="rgba(230,203,139,0.12)" />
                </pattern>
                <clipPath id="hemiClip">
                  <circle cx="500" cy="400" r="358" />
                </clipPath>
                <filter id="soft3" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
                <filter id="soft8" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" />
                </filter>
              </defs>

              {/* Atmosphere halo */}
              <circle cx="500" cy="400" r="430" fill="url(#hemiAtmo)" />

              {/* The planet */}
              <circle cx="500" cy="400" r="360" fill="url(#hemiTop)" />

              {/* Cyan rim light — sharp line over a soft volumetric glow */}
              <circle cx="500" cy="400" r="360" stroke="rgba(120,200,250,0.5)" strokeWidth="7" filter="url(#soft8)" />
              <circle cx="500" cy="400" r="360" stroke="rgba(150,215,255,0.55)" strokeWidth="1.5" />

              {/* Drifting city-light surface + faint latitudes */}
              <g clipPath="url(#hemiClip)">
                <g className="globe-drift">
                  <rect x="-760" y="30" width="2280" height="380" fill="url(#hemiDots)" />
                </g>
                <path d="M 175 250 Q 500 175 825 250" stroke="rgba(150,200,245,0.14)" strokeWidth="1" />
                <path d="M 92 330 Q 500 240 908 330" stroke="rgba(150,200,245,0.11)" strokeWidth="1" />
              </g>

              {/* Volumetric light beams rising from the brightest cities */}
              {([[290, 300], [500, 215], [705, 285]] as [number, number][]).map(([bx, by]) => (
                <rect
                  key={`beam-${bx}`}
                  x={bx - 2.5}
                  y={by - 160}
                  width="5"
                  height="160"
                  fill="url(#beamGrad)"
                  filter="url(#soft3)"
                  opacity="0.8"
                />
              ))}

              {/* City clusters */}
              {([
                [240, 330, 0], [330, 252, 0.5], [430, 205, 1], [560, 195, 0.3], [680, 240, 0.8],
                [790, 312, 1.3], [290, 300, 1.7], [500, 215, 0.6], [705, 285, 1.1],
              ] as [number, number, number][]).map(([cx, cy, d]) => (
                <g key={`city-${cx}-${cy}`}>
                  <circle cx={cx} cy={cy} r="6" fill="rgba(160,220,255,0.22)" />
                  <circle cx={cx} cy={cy} r="2.4" fill="#EAF6FF" className="hero-twinkle" style={{ animationDelay: `${d}s` }} />
                </g>
              ))}

              {/* Golden fiber-optic routes — gold lives only on the network */}
              <g stroke="rgba(238,208,142,0.8)" strokeWidth="1.3">
                <path className="fiber-line" d="M240 330 Q380 60 560 195" />
                <path className="fiber-line" d="M330 252 Q505 20 680 240" style={{ animationDelay: '-1s' }} />
                <path className="fiber-line" d="M430 205 Q640 60 790 312" style={{ animationDelay: '-2s' }} />
                <path className="fiber-line" d="M240 330 Q515 -60 790 312" strokeWidth="1" style={{ animationDelay: '-3s' }} />
                <path className="fiber-line" d="M330 252 Q430 110 560 195" strokeWidth="1" style={{ animationDelay: '-1.6s' }} />
                <path className="fiber-line" d="M560 195 Q700 120 860 260" strokeWidth="1" style={{ animationDelay: '-2.4s' }} />
                <path className="fiber-line" d="M430 205 Q300 90 130 220" strokeWidth="1" style={{ animationDelay: '-0.6s' }} />
                <path className="globe-wire" d="M290 300 Q505 90 705 285" strokeWidth="1.2" />
                {/* Routes that dive past the horizon — picked up by the lower
                    hemisphere at the top of the showcase */}
                <path className="fiber-line" d="M143 398 Q190 330 270 300" strokeWidth="1.1" style={{ animationDelay: '-2.8s' }} />
                <path className="fiber-line" d="M857 398 Q810 335 730 292" strokeWidth="1.1" style={{ animationDelay: '-1.2s' }} />
              </g>

              {/* Data packets riding the fibers */}
              <circle r="2.6" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="4.5s" repeatCount="indefinite" path="M240 330 Q380 60 560 195" />
              </circle>
              <circle r="2.6" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="6s" repeatCount="indefinite" path="M330 252 Q505 20 680 240" />
              </circle>
              <circle r="2.4" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="7.5s" repeatCount="indefinite" path="M240 330 Q515 -60 790 312" />
              </circle>

              {/* Golden nodes + hub pings */}
              {([
                [240, 330], [330, 252], [430, 205], [560, 195], [680, 240], [790, 312],
                [143, 396], [857, 396],
              ] as [number, number][]).map(([nx, ny]) => (
                <circle key={`node-${nx}-${ny}`} cx={nx} cy={ny} r="2.6" fill="#E6CB8B" className="globe-node" />
              ))}
              <circle cx="240" cy="330" r="9" stroke="rgba(230,203,139,0.5)" strokeWidth="1" fill="none" className="globe-ping" />
              <circle cx="560" cy="195" r="9" stroke="rgba(230,203,139,0.5)" strokeWidth="1" fill="none" className="globe-ping" style={{ animationDelay: '1.4s' }} />

              {/* The flight, tracing the longest route */}
              <g className="hero-jet">
                <g transform="rotate(90) scale(1.5) translate(-12 -12)">
                  <path d={JET_PATH} fill="#F7EAC0" />
                </g>
                <animateMotion dur="15s" repeatCount="indefinite" rotate="auto" path="M240 330 Q515 -60 790 312" />
              </g>

              {/* Light fog hugging the horizon */}
              <ellipse cx="500" cy="398" rx="560" ry="70" fill="rgba(190,225,255,0.05)" filter="url(#soft8)" />
            </svg>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          One continuous "Temple Night → Golden Dawn" canvas.
          Every section below is transparent and floats on this single cinematic
          backdrop, so the page reads as one concept from the showcase straight
          through to the final call to action — no dark/light patchwork.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="home-canvas relative overflow-hidden">
        {/* Persistent night sky threaded through the whole page */}
        <div className="stars pointer-events-none absolute inset-0" aria-hidden="true" />
        {/* Shared horizon glow at the seam — dissolves the line between the hero
            globe and the showcase so they read as one continuous sky. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-72 bg-[radial-gradient(72%_100%_at_50%_0%,rgba(198,151,73,0.20)_0%,rgba(198,151,73,0.06)_42%,transparent_74%)]"
          aria-hidden="true"
        />
        {/* Gold auras that recur down the canvas as the warm connective accent */}
        <div className="home-aura left-1/2 top-[8%] h-[600px] w-[600px] -translate-x-1/2" aria-hidden="true" />
        <div className="home-aura -left-40 top-[46%] h-[520px] w-[520px]" aria-hidden="true" />
        <div className="home-aura -right-40 top-[74%] h-[560px] w-[560px]" aria-hidden="true" />

        {/* ── Cambodia 3D Liquid-Glass destination showcase ── */}
        <CambodiaShowcase />

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <hr className="home-hairline" aria-hidden="true" />
        </div>

        {/* ── Feature showcase ── */}
        <section className="section-pad relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHeading
                dark
                eyebrow={t('features.eyebrow')}
                title={t('features.title')}
                description={t('features.desc')}
              />
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {features.map((f, i) => (
                <Reveal key={f.nameKey} delay={i * 110}>
                  <div className="glass-card group h-full p-8">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card border border-gold-light/25 bg-gradient-to-br from-gold-light/20 to-accent/10 transition-all duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3 group-hover:border-gold-light/50">
                      <f.icon size={30} className="text-gold-light" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-lg font-bold tracking-tight text-white">{t(f.nameKey)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{t(f.descKey)}</p>
                    <Link
                      href={f.href}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light transition-all duration-200 hover:gap-2.5 hover:text-gold-bright"
                    >
                      {t('features.learnMore')} <ArrowRight size={14} />
                    </Link>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="section-pad relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHeading dark eyebrow={t('how.eyebrow')} title={t('how.title')} />
            </Reveal>
            <div className="relative grid gap-10 md:grid-cols-4">
              {/* Animated flight path connecting the four steps on desktop */}
              <svg
                className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-3 w-3/4 md:block"
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line x1="0" y1="3" x2="100" y2="3" stroke="rgba(230,203,139,0.22)" strokeWidth="0.6" />
                <line
                  x1="0"
                  y1="3"
                  x2="100"
                  y2="3"
                  stroke="rgba(230,203,139,0.85)"
                  strokeWidth="0.7"
                  className="arc-line"
                />
              </svg>
              {stepKeys.map((key, i) => (
                <Reveal key={key} delay={i * 130}>
                  <div className="relative flex flex-col items-center text-center">
                    <div className="step-token z-10 h-14 w-14 font-display text-lg font-bold text-gold-bright">
                      {i + 1}
                    </div>
                    <p className="mt-5 max-w-[200px] font-medium text-white/80">{t(key)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Popular destinations ── */}
        <section className="section-pad relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHeading dark eyebrow={t('dest.eyebrow')} title={t('dest.title')} description={t('dest.desc')} />
            </Reveal>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {popularDestinations.map((dest, i) => (
                <Reveal key={dest.slug} delay={(i % 4) * 80}>
                  <DestinationCard destination={dest} variant="glass" />
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-12 text-center">
              <Button href="/esim" variant="liquid">
                {t('dest.viewAll')} <ArrowRight size={16} />
              </Button>
            </Reveal>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section className="section-pad relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHeading dark eyebrow={t('testi.eyebrow')} title={t('testi.title')} />
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {testimonials.map((tm, i) => (
                <Reveal key={tm.name} delay={i * 110}>
                  <figure className="glass-card liquid-sheen h-full p-8">
                    <div className="flex gap-1" aria-label="5 out of 5 stars">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star key={s} size={16} className="fill-gold-light text-gold-light" aria-hidden="true" />
                      ))}
                    </div>
                    <blockquote className="mt-4 text-sm leading-relaxed text-white/75">
                      “{tm.quote}”
                    </blockquote>
                    <figcaption className="mt-6 flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-light/30 bg-gradient-to-br from-secondary-high to-primary-deep text-sm font-bold text-gold-light">
                        {tm.initials}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{tm.name}</p>
                        <p className="text-xs text-white/45">{tm.trip}</p>
                      </div>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Bottom CTA — the horizon the whole journey has been descending toward ── */}
        <section className="relative py-24">
          <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              {t('cta.title')}
            </h2>
            <p className="mt-4 text-white/70">{t('cta.sub')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/esim" variant="liquid-accent" size="lg">
                {t('hero.ctaEsim')}
              </Button>
              <Button href="/checklist" variant="liquid" size="lg">
                {t('cta.checklist')}
              </Button>
            </div>
          </Reveal>
        </section>
      </div>
    </>
  );
}
