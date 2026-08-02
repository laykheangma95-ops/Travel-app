'use client';

import Link from 'next/link';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { CambodiaShowcase } from '@/components/home/CambodiaShowcase';
import { GlobeHero } from '@/components/home/GlobeHero';
import { JourneyCompanion } from '@/components/home/JourneyCompanion';
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


export function HomeContent() {
  const { t } = useLang();

  return (
    <>
      {/* ── Hero + Cambodia showcase share ONE full 3D globe. The .dgh-stage
          wrapper (styled inside GlobeHero) lets a single sphere span both
          sections so they read as one continuous page. ── */}
      <div className="dgh-stage">
        <GlobeHero />
        <CambodiaShowcase />
      </div>

      {/* ── One continuous night sky from here down. The globe hero flows into
          this nocturnal surface so the cinematic energy never drops into flat
          light cards (see .claude/skills/ui-ux → "rule of continuity"). ── */}
      <div className="night-canvas">
        <div className="night-stars" aria-hidden="true" />

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
              {popularDestinations.map((dest, i) => (
                <Reveal key={dest.slug} delay={(i % 4) * 80}>
                  <DestinationCard destination={dest} dark />
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
      </div>

      {/* Persistent mini-globe that rides the night sky (scroll companion). */}
      <JourneyCompanion />
    </>
  );
}
