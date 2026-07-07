import type { Metadata } from 'next';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { DestinationCard } from '@/components/esim/DestinationCard';
import { popularDestinations } from '@/data/destinations';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Domner App — Travel Confidently. Stay Connected.',
};

const features = [
  {
    icon: Smartphone,
    name: 'eSIM in 3 Minutes',
    description: 'Buy, install, connect. No physical SIM needed.',
    href: '/esim',
  },
  {
    icon: BellRing,
    name: 'Flight Guardian',
    description: 'Real-time alerts before the airline tells you.',
    href: '/flights',
  },
  {
    icon: MapPinned,
    name: 'Airport Companion',
    description: 'Step-by-step guide in Khmer at every stage.',
    href: '/airport-guide',
  },
];

const steps = [
  { n: 1, title: "Tell us where you're going" },
  { n: 2, title: 'Get your eSIM + flight setup' },
  { n: 3, title: 'We guide you at the airport' },
  { n: 4, title: 'Arrive safely and confidently' },
];

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
      'The gate change notification saved me. I was in the coffee shop and Domner told me before the screen did.',
  },
  {
    initials: 'CS',
    name: 'Channary S.',
    trip: 'Thailand trip',
    quote:
      'First time flying alone. The airport guide told me exactly what to do at each step. I felt safe.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero — dusk sky, starfield, network globe ── */}
      <section className="relative flex min-h-[100vh] items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#04070F_0%,#0A1628_38%,#14264D_66%,#2A3A6E_84%,#0A1628_100%)]">
        {/* Starfield */}
        <div className="stars" aria-hidden="true" />
        <div className="stars-far" aria-hidden="true" />

        {/* Sunset horizon glow behind the globe */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] animate-globe-glow bg-[radial-gradient(60%_55%_at_50%_100%,rgba(249,115,22,0.22)_0%,rgba(59,130,246,0.10)_45%,transparent_75%)]"
          aria-hidden="true"
        />

        {/* Globe rising from the bottom edge */}
        <div
          className="hero-globe pointer-events-none absolute left-1/2 top-full h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-[30%] rounded-full sm:h-[62rem] sm:w-[62rem] sm:-translate-y-[34%]"
          aria-hidden="true"
        />

        {/* Network arcs over the globe */}
        <svg
          className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[900px] max-w-none -translate-x-1/2 sm:h-[360px]"
          viewBox="0 0 900 360"
          fill="none"
          aria-hidden="true"
        >
          <path d="M120 330 Q 300 120 520 260" stroke="rgba(251,146,60,0.75)" strokeWidth="1.5" className="arc-line" />
          <path d="M240 350 Q 480 60 760 300" stroke="rgba(251,146,60,0.55)" strokeWidth="1.5" className="arc-line" style={{ animationDelay: '-1.2s' }} />
          <path d="M60 300 Q 420 180 830 340" stroke="rgba(147,197,253,0.5)" strokeWidth="1.2" className="arc-line" style={{ animationDelay: '-2.1s' }} />
          <path d="M420 355 Q 600 150 880 260" stroke="rgba(251,146,60,0.45)" strokeWidth="1.2" className="arc-line" style={{ animationDelay: '-0.6s' }} />
          {[
            [120, 330], [520, 260], [240, 350], [760, 300], [60, 300], [830, 340], [880, 260],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" fill="#FDBA74" className="arc-node" />
          ))}
        </svg>

        {/* Floating jet above the globe */}
        <svg
          className="pointer-events-none absolute bottom-[280px] left-1/2 h-12 w-12 -translate-x-1/2 animate-float-y text-white/90 drop-shadow-[0_6px_18px_rgba(147,197,253,0.45)] sm:bottom-[330px] sm:h-16 sm:w-16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M21.5 15.5 13.5 11V4.75a1.5 1.5 0 0 0-3 0V11l-8 4.5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13.5 19v-4l8 2.5v-2Z" />
        </svg>

        <div className="relative mx-auto max-w-5xl px-4 pb-72 pt-24 text-center sm:px-6 sm:pb-80">
          <span className="liquid-glass liquid-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide text-white animate-fade-up">
            Cambodia&apos;s First Travel Super App 🇰🇭
          </span>
          <h1 className="mt-8 font-display text-5xl font-extrabold leading-[1.02] tracking-[-0.03em] text-white sm:text-7xl lg:text-8xl animate-fade-up [animation-delay:100ms]">
            Travel
            <span className="bg-gradient-to-r from-orange-300 via-accent to-orange-500 bg-clip-text text-transparent"> Confidently</span>
            .
            <br />
            Stay Connected.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl animate-fade-up [animation-delay:200ms]">
            eSIM for 150+ countries. Real-time flight alerts. Step-by-step airport guidance. All in
            Khmer.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up [animation-delay:300ms]">
            <Button href="/esim" variant="liquid-accent" size="lg">
              Get Your eSIM
            </Button>
            <Button href="/flights" variant="liquid" size="lg">
              Track My Flight
            </Button>
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold text-white/60 animate-fade-up [animation-delay:400ms]">
            <span>150+ Countries</span>
            <span className="hidden text-white/25 sm:inline">·</span>
            <span>24/7 Khmer Support</span>
            <span className="hidden text-white/25 sm:inline">·</span>
            <span>Instant Delivery</span>
          </div>
        </div>
      </section>

      {/* ── Feature showcase ── */}
      <section className="section-pad bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Why Domner"
              title="Everything a Cambodian traveler needs"
              description="Three tools that work together, from booking to landing."
            />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.name} delay={i * 110}>
                <div className="group h-full rounded-card border border-line/60 bg-white p-8 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:shadow-card-hover">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card bg-orange-50 transition-all duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-accent/15">
                    <f.icon size={32} className="text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink">{f.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.description}</p>
                  <Link
                    href={f.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary transition-all duration-200 hover:gap-2.5 hover:text-accent"
                  >
                    Learn more <ArrowRight size={14} />
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
            <SectionHeading eyebrow="How it works" title="From your sofa to your destination" />
          </Reveal>
          <div className="relative grid gap-10 md:grid-cols-4">
            {/* Connecting line on desktop */}
            <div
              className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-line md:block"
              aria-hidden="true"
            />
            {steps.map((step, i) => (
              <Reveal key={step.n} delay={i * 130}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-secondary font-display text-lg font-bold text-white shadow-card transition-transform duration-300 ease-smooth hover:scale-110">
                    {step.n}
                  </div>
                  <p className="mt-4 max-w-[200px] font-medium text-ink">{step.title}</p>
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
            <SectionHeading
              eyebrow="Popular destinations"
              title="Where are you flying next?"
              description="Instant eSIM delivery for the routes Cambodians travel most."
            />
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
              View all destinations <ArrowRight size={16} />
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="section-pad bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading eyebrow="Travelers trust Domner" title="Stories from the road" />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 110}>
                <figure className="h-full rounded-card border border-line/60 bg-surface-2 p-8 shadow-card transition-all duration-300 ease-smooth hover:-translate-y-1 hover:bg-white hover:shadow-card-hover">
                  <div className="flex gap-1" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={16} className="fill-warning text-warning" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-ink-secondary">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-white">
                      {t.initials}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{t.name}</p>
                      <p className="text-xs text-ink-muted">{t.trip}</p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0A1628_0%,#14264D_60%,#0A1628_100%)] py-20">
        <div className="stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Ready for your next trip?
          </h2>
          <p className="mt-4 text-white/70">
            Join thousands of Cambodian travelers who fly with confidence.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/esim" variant="liquid-accent" size="lg">
              Get Your eSIM
            </Button>
            <Button href="/checklist" variant="liquid" size="lg">
              Am I Ready? Checklist
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
