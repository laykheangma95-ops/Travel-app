'use client';

import Link from 'next/link';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { CambodiaShowcase } from '@/components/home/CambodiaShowcase';
import { GlobeHero } from '@/components/home/GlobeHero';
import { TripBoard } from '@/components/home/TripBoard';
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

      {/* ── Trip board (signature asymmetric bento) ── */}
      <TripBoard />

      {/* ── Feature showcase (Temple Night) ── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_100%)] section-pad">
        <div className="stars-far" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
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
                <div className="glass-panel liquid-touch group h-full rounded-card p-8 transition-all duration-300 ease-smooth hover:-translate-y-1 hover:border-gold-light/40">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card bg-gold-light/10 transition-all duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-accent/25">
                    <f.icon size={32} className="text-gold-light" aria-hidden="true" />
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

      {/* ── How it works (Temple Night) ── */}
      <section id="how-it-works" className="relative overflow-hidden bg-[linear-gradient(180deg,#14263F_0%,#0E1B30_100%)] section-pad">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading dark eyebrow={t('how.eyebrow')} title={t('how.title')} />
          </Reveal>
          <div className="relative grid gap-10 md:grid-cols-4">
            {/* Connecting line on desktop */}
            <div
              className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-white/15 md:block"
              aria-hidden="true"
            />
            {stepKeys.map((key, i) => (
              <Reveal key={key} delay={i * 130}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 border-primary-deep bg-[linear-gradient(160deg,#F7EAC0,#C69749)] font-display text-lg font-bold text-primary-deep shadow-[0_6px_20px_rgba(198,151,73,0.4)] transition-transform duration-300 ease-smooth hover:scale-110">
                    {i + 1}
                  </div>
                  <p className="mt-4 max-w-[200px] font-medium text-white/80">{t(key)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Popular destinations (deliberate daylight beat) ── */}
      <section className="section-pad bg-[linear-gradient(180deg,#F6F1E7_0%,#FFFFFF_100%)]">
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

      {/* ── Testimonials (Temple Night) ── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_100%)] section-pad">
        <div className="stars-far" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading dark eyebrow={t('testi.eyebrow')} title={t('testi.title')} />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((tm, i) => (
              <Reveal key={tm.name} delay={i * 110}>
                <figure className="glass-panel liquid-touch h-full rounded-card p-8 transition-all duration-300 ease-smooth hover:-translate-y-1 hover:border-gold-light/30">
                  <div className="flex gap-1" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={16} className="fill-gold-light text-gold-light" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-white/70">
                    “{tm.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(160deg,#F7EAC0,#C69749)] text-sm font-bold text-primary-deep">
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
