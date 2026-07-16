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
        className="relative flex min-h-[100vh] flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_38%,#1C3355_66%,#2A4A7A_84%,#14263F_100%)] pb-10"
      >
        {/* Starfield */}
        <div className="stars" aria-hidden="true" />
        <div className="stars-far" aria-hidden="true" />

        {/* Sunrise glow behind the globe */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] animate-globe-glow bg-[radial-gradient(60%_55%_at_50%_100%,rgba(198,151,73,0.22)_0%,rgba(35,64,106,0.20)_45%,transparent_75%)]"
          aria-hidden="true"
        />

        <div className="hero-copy relative z-10 mx-auto max-w-5xl px-4 pt-28 text-center sm:px-6 sm:pt-32">
          <span className="liquid-glass liquid-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide text-white animate-fade-up">
            {t('hero.badge')}
          </span>
          <h1 className="mt-8 font-display text-5xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-7xl lg:text-8xl animate-fade-up [animation-delay:100ms]">
            {t('hero.t1')}
            <span className="bg-gradient-to-r from-gold-bright via-gold-light to-accent bg-clip-text text-transparent">
              {' '}
              {t('hero.t2')}
            </span>
            <br />
            {t('hero.t3')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl animate-fade-up [animation-delay:200ms]">
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
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold text-white/60 animate-fade-up [animation-delay:400ms]">
            <span>{t('hero.stat1')}</span>
            <span className="hidden text-white/25 sm:inline">·</span>
            <span>{t('hero.stat2')}</span>
            <span className="hidden text-white/25 sm:inline">·</span>
            <span>{t('hero.stat3')}</span>
          </div>
        </div>

        {/* ── Full living globe — a realistic sphere wrapped in golden eSIM
            wires that link city to city. It descends toward the Cambodia
            showcase below, so both scenes share one world. ── */}
        <div className="hero-scene relative z-[1] mt-4 w-[340px] shrink-0 sm:mt-6 sm:w-[460px] lg:w-[520px]" aria-hidden="true">
          <div className="animate-float-y [animation-duration:9s]">
            <svg viewBox="0 0 800 800" fill="none" className="h-auto w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
              <defs>
                {/* Sun-lit ocean sphere: light falls from the upper left */}
                <radialGradient id="gSphere" cx="0.36" cy="0.26" r="1">
                  <stop offset="0" stopColor="#3E6699" />
                  <stop offset="0.3" stopColor="#27476F" />
                  <stop offset="0.6" stopColor="#16294A" />
                  <stop offset="0.85" stopColor="#0D1B33" />
                  <stop offset="1" stopColor="#081222" />
                </radialGradient>
                {/* Thin blue atmosphere warming to gold at the limb */}
                <radialGradient id="gAtmo" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0.6" stopColor="rgba(126,178,255,0)" />
                  <stop offset="0.78" stopColor="rgba(126,178,255,0.12)" />
                  <stop offset="0.9" stopColor="rgba(230,203,139,0.18)" />
                  <stop offset="1" stopColor="rgba(230,203,139,0)" />
                </radialGradient>
                {/* Day → night terminator falling to the lower right */}
                <radialGradient id="gShade" cx="0.32" cy="0.22" r="0.95">
                  <stop offset="0.5" stopColor="rgba(0,0,0,0)" />
                  <stop offset="1" stopColor="rgba(3,8,18,0.6)" />
                </radialGradient>
                {/* Soft specular sun glint */}
                <radialGradient id="gSpec" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0" stopColor="rgba(255,255,255,0.16)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <linearGradient id="gRim" x1="400" y1="80" x2="400" y2="720" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#E6CB8B" stopOpacity="0.6" />
                  <stop offset="0.4" stopColor="#C69749" stopOpacity="0.1" />
                  <stop offset="1" stopColor="#C69749" stopOpacity="0" />
                </linearGradient>
                <pattern id="gDots" width="18" height="16" patternUnits="userSpaceOnUse">
                  <circle cx="3" cy="4" r="1.1" fill="rgba(230,203,139,0.20)" />
                  <circle cx="12" cy="11" r="0.9" fill="rgba(147,197,253,0.18)" />
                </pattern>
                <clipPath id="gClip">
                  <circle cx="400" cy="400" r="318" />
                </clipPath>
              </defs>

              {/* Atmosphere halo */}
              <circle cx="400" cy="400" r="396" fill="url(#gAtmo)" />

              {/* Far side of the flight orbit — passes behind the sphere */}
              <g transform="rotate(-14 400 400)">
                <path d="M 5 400 A 395 140 0 0 1 795 400" stroke="rgba(230,203,139,0.16)" strokeWidth="1.2" strokeDasharray="4 9" fill="none" />
              </g>

              {/* The sphere */}
              <circle className="hero-sphere" cx="400" cy="400" r="320" fill="url(#gSphere)" />

              {/* Rotating dotted surface at two depths — the earth turning */}
              <g clipPath="url(#gClip)">
                <g className="globe-drift-slow" opacity="0.45">
                  <rect x="-760" y="90" width="2280" height="620" fill="url(#gDots)" />
                </g>
                <g className="globe-drift">
                  <rect x="-760" y="90" width="2280" height="620" fill="url(#gDots)" />
                </g>
              </g>

              {/* Wireframe graticule with spherical perspective */}
              <g stroke="rgba(147,197,253,0.13)" strokeWidth="1" fill="none">
                <line x1="400" y1="80" x2="400" y2="720" />
                <ellipse cx="400" cy="400" rx="120" ry="320" />
                <ellipse cx="400" cy="400" rx="225" ry="320" />
                <ellipse cx="400" cy="400" rx="298" ry="320" />
                <ellipse cx="400" cy="123" rx="160" ry="36" />
                <ellipse cx="400" cy="240" rx="277" ry="58" />
                <ellipse cx="400" cy="400" rx="320" ry="66" />
                <ellipse cx="400" cy="560" rx="277" ry="58" />
                <ellipse cx="400" cy="677" rx="160" ry="36" />
              </g>

              {/* Light: terminator shading, sun glint, gilded rim */}
              <circle cx="400" cy="400" r="320" fill="url(#gShade)" />
              <ellipse cx="292" cy="240" rx="180" ry="115" fill="url(#gSpec)" />
              <circle cx="400" cy="400" r="319" stroke="url(#gRim)" strokeWidth="1.6" />

              {/* Golden wires — live eSIM routes linking city to city */}
              <g stroke="rgba(240,216,150,0.95)" strokeWidth="2.1">
                <path className="globe-wire" d="M520 470 Q640 380 610 300" />
                <path className="globe-wire" d="M520 470 Q515 545 470 560" style={{ animationDelay: '-0.7s' }} />
                <path className="globe-wire" d="M470 560 Q382 565 300 430" style={{ animationDelay: '-1.4s' }} />
                <path className="globe-wire" d="M300 430 Q225 330 255 255" style={{ animationDelay: '-2.1s' }} />
                <path className="globe-wire" d="M255 255 Q145 270 150 350" style={{ animationDelay: '-0.4s' }} />
                <path className="globe-wire" d="M610 300 Q700 450 585 585" style={{ animationDelay: '-1.8s' }} />
                <path className="globe-wire" d="M150 350 Q135 425 170 480" style={{ animationDelay: '-1.1s' }} />
                <path className="globe-wire" d="M300 200 Q235 315 300 430" style={{ animationDelay: '-2.6s' }} />
                {/* The long haul — over the pole */}
                <path className="globe-wire" d="M150 350 Q400 -260 610 300" stroke="rgba(230,203,139,0.6)" style={{ animationDelay: '-3s' }} />
              </g>

              {/* Data packets riding the wires */}
              <circle r="3" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="4s" repeatCount="indefinite" path="M520 470 Q640 380 610 300" />
              </circle>
              <circle r="3" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="6.5s" repeatCount="indefinite" path="M150 350 Q400 -260 610 300" />
              </circle>
              <circle r="2.6" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="5s" repeatCount="indefinite" path="M470 560 Q382 565 300 430" />
              </circle>
              <circle r="2.6" fill="#F7EAC0" className="globe-node">
                <animateMotion dur="5.6s" repeatCount="indefinite" path="M300 430 Q225 330 255 255" />
              </circle>

              {/* City nodes — hubs ping like a live network map */}
              {([
                [520, 470, 0, true], // Phnom Penh — home hub
                [610, 300, 0.5, false],
                [470, 560, 1, false],
                [300, 430, 1.5, true],
                [255, 255, 0.8, false],
                [150, 350, 1.9, true],
                [585, 585, 0.3, false],
                [170, 480, 1.2, false],
                [300, 200, 2.2, false],
              ] as [number, number, number, boolean][]).map(([cx, cy, delay, hub]) => (
                <g key={`${cx}-${cy}`}>
                  {hub && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="9"
                      stroke="rgba(230,203,139,0.5)"
                      strokeWidth="1"
                      fill="none"
                      className="globe-ping"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="3.2"
                    fill="#E6CB8B"
                    className="globe-node hero-twinkle"
                    style={{ animationDelay: `${delay}s` }}
                  />
                </g>
              ))}

              {/* Near side of the orbit + the flight */}
              <g transform="rotate(-14 400 400)">
                <path d="M 795 400 A 395 140 0 0 1 5 400" stroke="rgba(230,203,139,0.38)" strokeWidth="1.4" strokeDasharray="4 9" fill="none" />
                <path id="gOrbit" d="M 5 400 A 395 140 0 0 1 795 400 A 395 140 0 0 1 5 400" fill="none" />
                <g className="hero-jet">
                  <g transform="rotate(90) scale(1.7) translate(-12 -12)">
                    <path d={JET_PATH} fill="#F7EAC0" />
                  </g>
                  <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#gOrbit" />
                  </animateMotion>
                </g>
              </g>
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
