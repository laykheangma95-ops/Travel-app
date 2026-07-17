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

        <div className="hero-copy relative mx-auto max-w-5xl px-4 pb-24 pt-24 text-center sm:px-6 sm:pb-28">
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
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold text-white/60 animate-fade-up [animation-delay:400ms]">
            <span>{t('hero.stat1')}</span>
            <span className="hidden text-white/25 sm:inline">·</span>
            <span>{t('hero.stat2')}</span>
            <span className="hidden text-white/25 sm:inline">·</span>
            <span>{t('hero.stat3')}</span>
          </div>
        </div>
      </section>

      {/* ── The living globe — standing full between the Hero and the Circle
          Showcase, with the gold arcs and orbiting flight from the hero ── */}
      <section
        className="relative overflow-hidden bg-[linear-gradient(180deg,#14263F_0%,#0E1B30_100%)] pb-0 pt-4 sm:pt-6"
        aria-hidden="true"
      >
        <div className="stars" aria-hidden="true" />
        <div className="relative mx-auto w-[min(78vw,460px)]">
          {/* Atmosphere glow ring */}
          <div className="absolute inset-[4%] rounded-full shadow-[0_0_70px_rgba(127,200,218,0.35),0_0_28px_rgba(198,151,73,0.22)] ring-1 ring-[#7FC8DA]/30" />
          <svg viewBox="0 0 500 500" fill="none" className="relative h-auto w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="globeSphere" cx="0.42" cy="0.2" r="0.9">
                <stop offset="0" stopColor="#23406A" />
                <stop offset="0.4" stopColor="#14263F" />
                <stop offset="0.75" stopColor="#0E1B30" />
                <stop offset="1" stopColor="#091220" />
              </radialGradient>
              <linearGradient id="globeRim" x1="0" y1="20" x2="0" y2="480" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#E6CB8B" stopOpacity="0.55" />
                <stop offset="0.45" stopColor="#C69749" stopOpacity="0.12" />
                <stop offset="1" stopColor="#C69749" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="globeNight" x1="0" y1="250" x2="0" y2="480" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#091220" stopOpacity="0" />
                <stop offset="1" stopColor="#091220" stopOpacity="0.85" />
              </linearGradient>
              <pattern id="globeDotGrid" width="26" height="22" patternUnits="userSpaceOnUse">
                <circle cx="4" cy="5" r="1.4" fill="rgba(230,203,139,0.22)" />
                <circle cx="17" cy="16" r="1.1" fill="rgba(230,203,139,0.14)" />
              </pattern>
              <clipPath id="globeClip">
                <circle cx="250" cy="250" r="230" />
              </clipPath>
            </defs>

            {/* Sphere */}
            <circle cx="250" cy="250" r="230" fill="url(#globeSphere)" />
            {/* Gilded rim light on the crown */}
            <circle cx="250" cy="250" r="229" stroke="url(#globeRim)" strokeWidth="1.6" />

            {/* Rotating dotted surface + latitude lines + city lights */}
            <g clipPath="url(#globeClip)">
              <g className="hero-dots-drift">
                <rect x="-80" y="40" width="2200" height="420" fill="url(#globeDotGrid)" />
              </g>
              <path d="M 60 140 Q 250 80 440 140" stroke="rgba(230,203,139,0.16)" strokeWidth="1" />
              <path d="M 25 250 Q 250 170 475 250" stroke="rgba(230,203,139,0.13)" strokeWidth="1" />
              <path d="M 45 360 Q 250 270 455 360" stroke="rgba(230,203,139,0.10)" strokeWidth="1" />
              {[
                [175, 130, 0], [300, 105, 0.6], [385, 175, 1.1], [120, 210, 0.3], [410, 280, 0.9], [240, 235, 1.5], [160, 320, 0.7],
              ].map(([cx, cy, delay]) => (
                <circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r="2.6"
                  fill="#E6CB8B"
                  className="hero-twinkle arc-node"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
              {/* Night side — the lower half falls into shadow */}
              <circle cx="250" cy="250" r="230" fill="url(#globeNight)" />
            </g>

            {/* Network arcs hugging the crown */}
            <path d="M 75 200 Q 180 60 330 125" stroke="rgba(230,203,139,0.6)" strokeWidth="1.4" className="arc-line" />
            <path d="M 120 300 Q 250 30 430 235" stroke="rgba(230,203,139,0.42)" strokeWidth="1.3" className="arc-line" style={{ animationDelay: '-1.4s' }} />
            {[[75, 200], [330, 125], [430, 235]].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" fill="#E6CB8B" className="arc-node" />
            ))}

            {/* Orbit + the flight — nose always along the path */}
            <path
              id="globeOrbit"
              d="M -40 250 C 100 -30 400 -30 540 250"
              stroke="rgba(230,203,139,0.5)"
              strokeWidth="1.6"
              className="arc-line"
            />
            <g className="hero-jet">
              <g transform="rotate(90) scale(1.8) translate(-12 -12)">
                <path d={JET_PATH} fill="#F7EAC0" />
              </g>
              <animateMotion dur="14s" repeatCount="indefinite" rotate="auto">
                <mpath href="#globeOrbit" />
              </animateMotion>
            </g>
          </svg>
        </div>
      </section>

      {/* ── Cambodia 3D Liquid-Glass destination showcase ── */}
      <CambodiaShowcase />

      {/* ── Feature showcase ── */}
      <section className="section-pad bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              eyebrow={t('features.eyebrow')}
              title={t('features.title')}
              description={t('features.desc')}
            />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.nameKey} delay={i * 110}>
                <div className="group h-full rounded-card border border-line/60 bg-white p-8 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:shadow-card-hover">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card bg-[#F5EEDC] transition-all duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-accent/15">
                    <f.icon size={32} className="text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink">{t(f.nameKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t(f.descKey)}</p>
                  <Link
                    href={f.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary transition-all duration-200 hover:gap-2.5 hover:text-accent"
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
      <section id="how-it-works" className="section-pad bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading eyebrow={t('how.eyebrow')} title={t('how.title')} />
          </Reveal>
          <div className="relative grid gap-10 md:grid-cols-4">
            {/* Connecting line on desktop */}
            <div
              className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-line md:block"
              aria-hidden="true"
            />
            {stepKeys.map((key, i) => (
              <Reveal key={key} delay={i * 130}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-secondary font-display text-lg font-bold text-white shadow-card transition-transform duration-300 ease-smooth hover:scale-110">
                    {i + 1}
                  </div>
                  <p className="mt-4 max-w-[200px] font-medium text-ink">{t(key)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Popular destinations ── */}
      <section className="section-pad bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading eyebrow={t('dest.eyebrow')} title={t('dest.title')} description={t('dest.desc')} />
          </Reveal>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {popularDestinations.map((dest, i) => (
              <Reveal key={dest.slug} delay={(i % 4) * 80}>
                <DestinationCard destination={dest} />
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-12 text-center">
            <Button href="/esim" variant="outline">
              {t('dest.viewAll')} <ArrowRight size={16} />
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="section-pad bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading eyebrow={t('testi.eyebrow')} title={t('testi.title')} />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((tm, i) => (
              <Reveal key={tm.name} delay={i * 110}>
                <figure className="h-full rounded-card border border-line/60 bg-surface-2 p-8 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:bg-white hover:shadow-card-hover">
                  <div className="flex gap-1" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={16} className="fill-warning text-warning" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-ink-secondary">
                    “{tm.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-white">
                      {tm.initials}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{tm.name}</p>
                      <p className="text-xs text-ink-muted">{tm.trip}</p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#14263F_0%,#1C3355_60%,#14263F_100%)] py-20">
        <div className="stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">{t('cta.title')}</h2>
          <p className="mt-4 text-white/70">{t('cta.sub')}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/esim" variant="liquid-accent" size="lg">
              {t('hero.ctaEsim')}
            </Button>
            <Button href="/checklist" variant="liquid" size="lg">
              {t('cta.checklist')}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
