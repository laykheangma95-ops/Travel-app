'use client';

import Link from 'next/link';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { CambodiaShowcase } from '@/components/home/CambodiaShowcase';
import { GlobeHero } from '@/components/home/GlobeHero';
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

      {/* ── Feature showcase ── */}
      <section className="section-pad relative overflow-hidden bg-[linear-gradient(180deg,#14263F_0%,#1C3355_60%,#14263F_100%)]">
        <div className="stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t('features.eyebrow')}</p>
            <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">{t('features.title')}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/70">{t('features.desc')}</p>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.nameKey} delay={i * 110}>
                <div className="group h-full rounded-card border border-accent/20 bg-[radial-gradient(circle_at_30%_20%,#24406A_0%,#152A47_100%)] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-all duration-300 ease-smooth hover:-translate-y-1 hover:border-accent/40">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card border border-accent/40 bg-[#152A47] transition-all duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3">
                    <f.icon size={32} className="text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-white">{t(f.nameKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{t(f.descKey)}</p>
                  <Link
                    href={f.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-all duration-200 hover:gap-2.5"
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
      <section
        id="how-it-works"
        className="section-pad relative overflow-hidden bg-[linear-gradient(180deg,#14263F_0%,#1C3355_60%,#14263F_100%)]"
      >
        <div className="stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t('how.eyebrow')}</p>
            <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">{t('how.title')}</h2>
          </Reveal>
          <div className="mt-16 flex flex-col items-center gap-14">
            {stepKeys.map((key, i) => (
              <Reveal key={key} delay={i * 130}>
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-accent/50 bg-[radial-gradient(circle_at_30%_25%,#24406A_0%,#152A47_100%)] font-display text-2xl font-medium text-[#EBD9A8] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-smooth hover:scale-110">
                    {i + 1}
                  </div>
                  <p className="mt-5 max-w-[260px] text-lg text-white/85">{t(key)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Popular destinations ── */}
      <section className="section-pad relative overflow-hidden bg-[linear-gradient(180deg,#14263F_0%,#1C3355_60%,#14263F_100%)]">
        <div className="stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t('dest.eyebrow')}</p>
            <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">{t('dest.title')}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/70">{t('dest.desc')}</p>
          </Reveal>
          <div className="mt-14 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {popularDestinations.map((dest, i) => (
              <Reveal key={dest.slug} delay={(i % 4) * 80}>
                <DestinationCard destination={dest} />
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
