import type { Metadata } from 'next';
import { Smartphone, BellRing, MapPinned, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
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
      {/* ── Hero ── */}
      <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden bg-primary">
        {/* Animated gradient mesh */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-1/4 top-0 h-[70%] w-[70%] animate-gradient-drift rounded-full bg-secondary/40 blur-[140px]" />
          <div className="absolute -right-1/4 bottom-0 h-[60%] w-[60%] animate-gradient-drift rounded-full bg-accent/15 blur-[160px] [animation-delay:-8s]" />
          <div className="absolute left-1/3 top-1/3 h-[40%] w-[40%] animate-gradient-drift rounded-full bg-[#1B3A6B]/50 blur-[120px] [animation-delay:-16s]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-accent/25 animate-fade-up">
            Cambodia&apos;s First Travel Super App 🇰🇭
          </span>
          <h1 className="mt-8 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl animate-fade-up [animation-delay:100ms]">
            Travel Confidently.
            <br />
            Stay Connected.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl animate-fade-up [animation-delay:200ms]">
            eSIM for 150+ countries. Real-time flight alerts. Step-by-step airport guidance. All in
            Khmer.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up [animation-delay:300ms]">
            <Button href="/esim" size="lg">
              Get Your eSIM
            </Button>
            <Button href="/flights" variant="outline-light" size="lg">
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
          <SectionHeading
            eyebrow="Why Domner"
            title="Everything a Cambodian traveler needs"
            description="Three tools that work together, from booking to landing."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.name}
                className="group rounded-card border border-line/60 bg-white p-8 shadow-card transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card bg-orange-50 transition-colors group-hover:bg-accent/15">
                  <f.icon size={32} className="text-accent" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-bold text-ink">{f.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.description}</p>
                <Link
                  href={f.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary transition-colors hover:text-accent"
                >
                  Learn more <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="section-pad bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From your sofa to your destination" />
          <div className="relative grid gap-10 md:grid-cols-4">
            {/* Connecting line on desktop */}
            <div
              className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-line md:block"
              aria-hidden="true"
            />
            {steps.map((step) => (
              <div key={step.n} className="relative flex flex-col items-center text-center">
                <div className="z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-secondary font-display text-lg font-bold text-white shadow-card">
                  {step.n}
                </div>
                <p className="mt-4 max-w-[200px] font-medium text-ink">{step.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Popular destinations ── */}
      <section className="section-pad bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Popular destinations"
            title="Where are you flying next?"
            description="Instant eSIM delivery for the routes Cambodians travel most."
          />
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {popularDestinations.map((dest) => (
              <DestinationCard key={dest.slug} destination={dest} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button href="/esim" variant="outline">
              View all destinations <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="section-pad bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="Travelers trust Domner" title="Stories from the road" />
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.name}
                className="rounded-card border border-line/60 bg-surface-2 p-8 shadow-card"
              >
                <div className="flex gap-1" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={16} className="fill-warning text-warning" aria-hidden="true" />
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
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-primary py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Ready for your next trip?
          </h2>
          <p className="mt-4 text-white/70">
            Join thousands of Cambodian travelers who fly with confidence.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/esim" size="lg">
              Get Your eSIM
            </Button>
            <Button href="/checklist" variant="outline-light" size="lg">
              Am I Ready? Checklist
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
