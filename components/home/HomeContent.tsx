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
      {/* ══════════════════════════════════════════════════════════════════════
          One continuous immersive scene. The hero lives INSIDE the shared
          canvas — there is no section background change anywhere, so the
          Earth below is never cut by an edge: it simply extends past the fold
          and the showcase emerges from the same environment beneath it.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="home-canvas relative overflow-hidden">
        {/* Deep-space sky shared by every section */}
        <div className="stars pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="stars-far pointer-events-none absolute inset-0" aria-hidden="true" />
        {/* Gold auras that recur down the canvas as the warm connective accent */}
        <div className="home-aura -left-40 top-[46%] h-[520px] w-[520px]" aria-hidden="true" />
        <div className="home-aura -right-40 top-[74%] h-[560px] w-[560px]" aria-hidden="true" />

        {/* ── Hero — cinematic Earth with a living golden route network ── */}
        <section
          ref={heroRef}
          onMouseMove={onHeroPointer}
          onMouseLeave={resetHeroPointer}
          className="relative flex min-h-[110vh] items-start justify-center"
        >
          <div className="hero-copy relative z-10 mx-auto max-w-5xl px-4 pt-28 text-center sm:px-6 sm:pt-32">
            <span className="liquid-glass liquid-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide text-white animate-fade-up">
              {t('hero.badge')}
            </span>
            <h1 className="mt-8 font-display text-5xl font-normal leading-[1.08] tracking-[-0.02em] text-white sm:text-7xl lg:text-8xl animate-fade-up [animation-delay:100ms]">
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

          {/* ── The Earth — one uncut planet bridging hero and showcase.
              Anchored to the hero's base and translated 44% below the fold, it
              overlaps the next section as a single object: no edge, no seam —
              only atmosphere, haze and depth. ── */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex justify-center" aria-hidden="true">
            <div className="hero-scene relative aspect-square w-[680px] shrink-0 translate-y-[50%] sm:w-[920px] lg:w-[1120px]">
              {/* Far routes — wrapping the planet, disappearing behind it */}
              <svg viewBox="0 0 1000 1000" fill="none" className="absolute inset-0 h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                <g stroke="rgba(214,178,110,0.30)" strokeWidth="1">
                  {[
                    'M992 413 Q500 -400 8 413',
                    'M30 671 Q500 1450 970 671',
                    'M883 179 Q500 -520 117 179',
                    'M117 821 Q500 1330 883 821',
                    'M413 8 Q-280 500 413 992',
                    'M587 8 Q1280 500 587 992',
                    'M750 67 Q1250 850 250 933',
                    'M250 67 Q-250 850 750 933',
                  ].map((d, i) => (
                    <path key={d} className="fiber-line" d={d} style={{ animationDelay: `${-i * 0.9}s` }} />
                  ))}
                </g>
              </svg>

              {/* Atmospheric scattering + golden sunrise rim */}
              <div className="earth-atmo absolute -inset-[5%] rounded-full" />
              <div className="earth-sunrise absolute -inset-[8%] rounded-full" />

              {/* The planet — real NASA Blue Marble texture, slowly turning */}
              <div className="earth-sphere absolute inset-0">
                <div className="earth-belt">
                  <i />
                  <i />
                </div>
              </div>

              {/* Near routes — fiber-optic golden trajectories at varying
                  heights, with travelling light, glowing endpoints and the
                  flight riding the longest one */}
              <svg viewBox="0 0 1000 1000" fill="none" className="absolute inset-0 h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                <g stroke="rgba(216,181,114,0.8)">
                  {([
                    ['M67 250 Q500 -175 933 250', 1.5, 0.9],
                    ['M17 371 Q334 -120 854 146', 1.1, 0.6],
                    ['M8 587 Q33 33 587 8', 1, 0.5],
                    ['M67 750 Q500 1200 933 750', 1.2, 0.55],
                    ['M146 146 Q-5 890 750 933', 0.9, 0.4],
                    ['M750 67 Q1130 272 970 671', 1, 0.5],
                    ['M250 67 Q731 -139 970 329', 1.1, 0.6],
                    ['M413 8 Q210 -2 117 179', 0.9, 0.5],
                    ['M953 289 Q879 48 629 17', 1, 0.6],
                    ['M30 671 Q83 918 329 970', 0.9, 0.45],
                    ['M671 970 Q898 935 953 711', 0.9, 0.45],
                    ['M8 413 Q500 1150 992 587', 1.1, 0.5],
                    ['M787 90 Q500 -260 213 90', 1.2, 0.7],
                    ['M544 2 Q90 10 2 456', 1, 0.55],
                  ] as [string, number, number][]).map(([d, w, o], i) => (
                    <path
                      key={d}
                      className="fiber-line"
                      d={d}
                      strokeWidth={w}
                      opacity={o}
                      style={{ animationDelay: `${-i * 0.7}s` }}
                    />
                  ))}
                </g>

                {/* Light travelling the flagship route, just behind the jet */}
                <path
                  className="route-trail"
                  d="M67 250 Q500 -175 933 250"
                  pathLength={1000}
                  stroke="rgba(240,218,168,0.9)"
                  strokeWidth="2.4"
                  style={{ animationDelay: '0.35s' }}
                />

                {/* Data packets riding other routes */}
                {([
                  ['M8 587 Q33 33 587 8', 9],
                  ['M67 750 Q500 1200 933 750', 11],
                  ['M250 67 Q731 -139 970 329', 8],
                  ['M8 413 Q500 1150 992 587', 12],
                  ['M787 90 Q500 -260 213 90', 6.5],
                ] as [string, number][]).map(([d, dur]) => (
                  <circle key={`pk-${d}`} r="2.4" fill="#F0DAA8" className="globe-node">
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
                  </circle>
                ))}

                {/* Glowing route endpoints */}
                {([
                  [67, 250], [933, 250], [250, 67], [970, 329], [953, 289],
                  [629, 17], [787, 90], [213, 90], [8, 413], [992, 587],
                ] as [number, number][]).map(([nx, ny]) => (
                  <circle key={`ep-${nx}-${ny}`} cx={nx} cy={ny} r="2.8" fill="#E8D3A2" className="globe-node" />
                ))}

                {/* City lights on the day side, gently pulsing */}
                {([
                  [620, 320, 0], [430, 260, 0.6], [300, 420, 1.2], [700, 480, 0.3],
                  [540, 610, 0.9], [380, 700, 1.5], [660, 760, 0.4], [250, 610, 1.1],
                  [760, 300, 0.7], [480, 420, 1.8], [590, 180, 0.2], [330, 300, 1.4],
                ] as [number, number, number][]).map(([cx, cy, dl], i) => (
                  <circle
                    key={`ct-${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r="2.2"
                    fill={i % 3 === 0 ? 'rgba(190,225,255,0.9)' : '#E8D3A2'}
                    className="globe-node hero-twinkle"
                    style={{ animationDelay: `${dl}s` }}
                  />
                ))}
                <circle cx="620" cy="320" r="9" stroke="rgba(214,178,110,0.5)" strokeWidth="1" fill="none" className="globe-ping" />
                <circle cx="330" cy="300" r="9" stroke="rgba(214,178,110,0.5)" strokeWidth="1" fill="none" className="globe-ping" style={{ animationDelay: '1.6s' }} />

                {/* The flight — luxury cruise along the flagship route */}
                <g className="hero-jet">
                  <g transform="rotate(90) scale(1.6) translate(-12 -12)">
                    <path d={JET_PATH} fill="#F7EAC0" />
                  </g>
                  <animateMotion dur="12s" repeatCount="indefinite" rotate="auto" path="M67 250 Q500 -175 933 250" />
                </g>
              </svg>

              {/* Volumetric haze melting the planet's base into the next scene */}
              <div className="earth-fog absolute -inset-x-[12%] bottom-[-6%] h-[55%]" />
            </div>
          </div>
        </section>

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
