'use client';

/**
 * HomeContent — the whole homepage as one continuous surface.
 *
 * There are two states and no page loads between them:
 *
 *   IDLE     globe · greeting · one question · one line · one search field
 *   FOCUSED  the same globe, flying to the destination the visitor chose,
 *            followed by five chapters that answer a traveller's real
 *            questions before the sixth ever mentions a plan
 *
 * The chosen destination lives in the URL fragment, so the browser back button
 * genuinely reverses the flight and a link can be shared mid-journey — without
 * a navigation that would cut the globe.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { CambodiaShowcase } from '@/components/home/CambodiaShowcase';
import { GlobeHero, type GlobeFocus } from '@/components/home/GlobeHero';
import { IdleIntro } from '@/components/home/IdleIntro';
import { ArrivalHero } from '@/components/home/ArrivalHero';
import { DestinationJourney } from '@/components/home/DestinationJourney';
import { JourneyCompanion } from '@/components/home/JourneyCompanion';
import { moodRecipe } from '@/components/home/skyMoods';
import { popularDestinations, getDestination } from '@/data/destinations';
import { getDestinationProfile } from '@/data/destinationProfiles';
import { useLang, type DictKey } from '@/lib/i18n';
import type { Destination } from '@/types';

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

/** Hold the showcase in place while the globe pulls away from it. Unmounting
 *  it any earlier would shrink the canvas mid-flight and jog the sphere. */
const SHOWCASE_EXIT_MS = 900;

export function HomeContent() {
  const { t } = useLang();
  const [slug, setSlug] = useState<string | null>(null);
  const [showcaseMounted, setShowcaseMounted] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // Memoised on the slug, not rebuilt per render: `focus` is handed straight to
  // the globe, and a fresh object identity every render would restart the
  // flight mid-approach.
  const active = useMemo(() => {
    const dest = slug ? getDestination(slug) : undefined;
    const profile = slug ? getDestinationProfile(slug) : undefined;
    // Both must resolve — a hand-typed fragment must never half-open the journey.
    return dest && profile ? { dest, profile } : null;
  }, [slug]);

  const focus: GlobeFocus | null = useMemo(() => {
    if (!active) return null;
    const recipe = moodRecipe(active.profile.mood);
    return {
      lat: active.profile.lat,
      lon: active.profile.lon,
      rim: recipe.rim,
      accent: recipe.accent,
    };
  }, [active]);

  /* ── The fragment is the source of truth, so Back reverses the flight ── */
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      setSlug(getDestinationProfile(hash) ? hash : null);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const select = (d: Destination) => {
    if (!getDestinationProfile(d.slug)) return;
    // pushState, not location.hash: no scroll jump, no hashchange storm.
    window.history.pushState(null, '', `#${d.slug}`);
    setSlug(d.slug);
  };

  const clear = () => {
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setSlug(null);
  };

  // Every arrival and departure starts from the top of the sky.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.scrollY < 4) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setShowcaseMounted(true);
      return;
    }
    const id = window.setTimeout(() => setShowcaseMounted(false), SHOWCASE_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [slug]);

  /* ── One lighting change drives the whole page: stage gradient, atmosphere
       rim, pin and chapter accents all read from these three properties. ── */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const recipe = moodRecipe(active?.profile.mood);
    el.style.setProperty('--dgh-glow', recipe.glow);
    el.style.setProperty('--dgh-veil', recipe.veil);
    el.style.setProperty('--jrny-accent', recipe.accent);
  }, [active]);

  return (
    <div ref={rootRef} className="home-root">
      {/* ── Hero + Cambodia showcase share ONE full 3D globe. The .dgh-stage
          wrapper (styled inside GlobeHero) lets a single sphere span both
          sections so they read as one continuous page. Once a destination is
          chosen the showcase steps aside and the sphere becomes an approach. ── */}
      <div className="dgh-stage" data-focused={active ? 'true' : 'false'}>
        <GlobeHero focus={focus}>
          {active ? (
            <ArrivalHero dest={active.dest} profile={active.profile} onClear={clear} />
          ) : (
            <IdleIntro onSelect={select} />
          )}
        </GlobeHero>

        {showcaseMounted && (
          <div className={`home-showcase${active ? ' is-leaving' : ''}`}>
            <CambodiaShowcase />
          </div>
        )}
      </div>

      {/* ── One continuous night sky from here down. The globe hero flows into
          this nocturnal surface so the cinematic energy never drops into flat
          light cards (see .claude/skills/ui-ux → "rule of continuity"). ── */}
      <div className="night-canvas">
        <div className="night-stars" aria-hidden="true" />

        {active ? (
          <DestinationJourney dest={active.dest} profile={active.profile} onClear={clear} />
        ) : (
          <>
            {/* ── Feature showcase ── */}
            <section
              className="relative section-pad"
              data-journey-section
              data-journey-label={t('features.eyebrow')}
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <Reveal>
                  <SectionHeading
                    eyebrow={t('features.eyebrow')}
                    title={t('features.title')}
                    description={t('features.desc')}
                    dark
                  />
                </Reveal>
                <div className="grid gap-6 md:grid-cols-3">
                  {features.map((f, i) => (
                    <Reveal key={f.nameKey} delay={i * 110}>
                      <div className="group night-card h-full p-8">
                        <div className="night-icon mb-5 h-14 w-14">
                          <f.icon size={30} className="text-gold-light" aria-hidden="true" />
                        </div>
                        <h3 className="font-display text-lg font-bold tracking-tight text-white">{t(f.nameKey)}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/65">{t(f.descKey)}</p>
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

            {/* ── How it works — constellation path ── */}
            <section
              id="how-it-works"
              className="relative section-pad"
              data-journey-section
              data-journey-label={t('how.eyebrow')}
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <Reveal>
                  <SectionHeading eyebrow={t('how.eyebrow')} title={t('how.title')} dark />
                </Reveal>
                <div className="relative grid gap-10 md:grid-cols-4">
                  {/* Gold constellation arc connecting the steps on desktop */}
                  <svg
                    className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-4 w-3/4 md:block"
                    viewBox="0 0 100 4"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path className="constellation-line" d="M0,2 Q16.7,-1 33.3,2 T66.7,2 T100,2" />
                  </svg>
                  {stepKeys.map((key, i) => (
                    <Reveal key={key} delay={i * 130}>
                      <div className="relative flex flex-col items-center text-center">
                        <div className="constellation-node z-10 flex h-14 w-14 items-center justify-center font-display text-lg font-bold">
                          {i + 1}
                        </div>
                        <p className="mt-4 max-w-[200px] font-medium text-white/85">{t(key)}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Popular destinations ── */}
            <section
              className="relative section-pad"
              data-journey-section
              data-journey-label={t('dest.eyebrow')}
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <Reveal>
                  <SectionHeading eyebrow={t('dest.eyebrow')} title={t('dest.title')} description={t('dest.desc')} dark />
                </Reveal>
                <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
                  {popularDestinations.map((d, i) => (
                    <Reveal key={d.slug} delay={(i % 4) * 80}>
                      <DestinationCard destination={d} dark />
                    </Reveal>
                  ))}
                </div>
                <Reveal className="mt-12 text-center">
                  <Button href="/esim" variant="liquid" size="lg">
                    {t('dest.viewAll')} <ArrowRight size={16} />
                  </Button>
                </Reveal>
              </div>
            </section>

            {/* ── Testimonials — boarding passes ── */}
            <section
              className="relative section-pad"
              data-journey-section
              data-journey-label={t('testi.eyebrow')}
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <Reveal>
                  <SectionHeading eyebrow={t('testi.eyebrow')} title={t('testi.title')} dark />
                </Reveal>
                <div className="grid gap-6 md:grid-cols-3">
                  {testimonials.map((tm, i) => (
                    <Reveal key={tm.name} delay={i * 110}>
                      <figure className="boarding-pass h-full">
                        <div className="p-8">
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1" aria-label="5 out of 5 stars">
                              {Array.from({ length: 5 }).map((_, s) => (
                                <Star key={s} size={16} className="fill-gold-light text-gold-light" aria-hidden="true" />
                              ))}
                            </div>
                            <span className="font-mono text-xs uppercase tracking-widest text-white/40">Domer · Verified</span>
                          </div>
                          <blockquote className="mt-4 text-sm leading-relaxed text-white/80">
                            “{tm.quote}”
                          </blockquote>
                        </div>
                        <figcaption className="boarding-pass-seam flex items-center gap-3 px-8 py-5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-light/40 bg-gold-light/10 text-sm font-bold text-gold-light">
                            {tm.initials}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">{tm.name}</p>
                            <p className="text-xs text-white/50">{tm.trip}</p>
                          </div>
                        </figcaption>
                      </figure>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Bottom CTA ── */}
            <section className="relative overflow-hidden py-24">
              <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
                <h2 className="font-display text-3xl font-bold text-white sm:text-5xl">{t('cta.title')}</h2>
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
        )}
      </div>

      {/* Persistent mini-globe that rides the night sky (scroll companion).
          Re-keyed per destination so it re-reads the chapter sections that
          just replaced the idle ones. */}
      <JourneyCompanion key={slug ?? 'idle'} />
    </div>
  );
}
