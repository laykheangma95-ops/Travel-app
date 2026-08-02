import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowDown, MapPin, Signal } from 'lucide-react';
import { destinations, getDestination } from '@/data/destinations';
import { getPlansForCountry } from '@/data/esimPlans';
import { getCustomsRule } from '@/data/customsRules';
import { getScamAlerts } from '@/data/scamAlerts';
import { getDestinationGuide } from '@/data/destinationGuides';
import { PlanCard } from '@/components/esim/PlanCard';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { DeviceChecker } from '@/components/esim/DeviceChecker';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';
import { LocalClock } from '@/components/destination/LocalClock';
import {
  QuickFacts,
  WhenToGo,
  Highlights,
  TravelTips,
  EntryRequirements,
  SafetyAndEmergency,
} from '@/components/destination/DestinationOverview';

interface PageProps {
  params: { country: string };
}

export function generateStaticParams() {
  return destinations.map((d) => ({ country: d.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const dest = getDestination(params.country);
  if (!dest) return { title: 'Destination not found' };
  const guide = getDestinationGuide(params.country);
  // The guide is the reason to rank for this page, so it leads the description.
  return {
    title: `${dest.name} Travel Guide & eSIM`,
    description: guide
      ? `Travelling to ${dest.name} from Cambodia: entry rules, local time, plugs and voltage, daily budget, scams to avoid and emergency numbers — plus instant eSIM data from $${dest.fromPriceUsd.toFixed(2)}.`
      : `Instant ${dest.name} eSIM from $${dest.fromPriceUsd.toFixed(2)}. ${dest.networkTech} on ${dest.networks.join(' & ')}. Khmer support included.`,
  };
}

export default function CountryPlansPage({ params }: PageProps) {
  const dest = getDestination(params.country);
  if (!dest) notFound();

  const plans = getPlansForCountry(dest.slug);
  const customs = getCustomsRule(dest.slug);
  const guide = getDestinationGuide(dest.slug);
  const alerts = getScamAlerts(dest.slug);

  return (
    // One continuous night sky for the whole destination page — the guide flows
    // into the plans so the funnel never drops into flat light
    // (.claude/skills/ui-ux §9).
    <div className="night-canvas">
      <div className="night-stars" aria-hidden="true" />

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Deliberately typographic rather than a stock photograph. The design
          standard treats placeholder imagery as unfinished, and shipping a
          generic gradient "travel photo" would read as exactly that. Commissioned
          or licensed destination photography is the remaining upgrade here. */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <WavyFlag flag={dest.flag} label={`${dest.name} flag`} size={92} />
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                  Travel guide
                </p>
                <h1 className="mt-2 font-display text-4xl font-bold text-white sm:text-5xl">
                  {dest.name}
                </h1>
                <p className="mt-1 font-khmer text-lg text-white/60">{dest.nameKm}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {guide && (
                <div className="liquid-glass flex items-center gap-3 rounded-card px-5 py-3.5">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/55">Local time</p>
                    <LocalClock
                      timezone={guide.timezone}
                      className="font-mono text-xl font-bold text-white"
                    />
                  </div>
                </div>
              )}
              <div className="liquid-glass flex items-center gap-3 rounded-card px-5 py-3.5">
                <MapPin size={18} className="text-accent" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-white">Nationwide coverage</p>
                  <p className="text-xs text-white/60">
                    {dest.networkTech} · {dest.networkQuality}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Jump link rather than a buy button. Someone who already knows what
              they want can skip the guide in one tap; everyone else reads on. */}
          <a
            href="#plans"
            className="mt-8 inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/80 backdrop-blur-md transition-all duration-300 ease-smooth hover:border-gold-light/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
          >
            Skip to data plans from ${dest.fromPriceUsd.toFixed(2)}
            <ArrowDown size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <div className="relative mx-auto max-w-7xl space-y-14 px-4 pb-16 sm:px-6">
        {guide && (
          <>
            <QuickFacts destination={dest} guide={guide} />

            <div className="grid gap-6 lg:grid-cols-2">
              <WhenToGo guide={guide} />
              {customs ? (
                <EntryRequirements customs={customs} />
              ) : (
                <section className="night-card p-7">
                  <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                    Entry requirements
                  </p>
                  <h2 className="mt-3 font-display text-xl font-bold text-white">
                    Not published yet
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">
                    We haven&apos;t verified the current visa rules for {dest.name} on a Cambodian
                    passport. Rather than guess, ask our Khmer support team — they will check with
                    the embassy and reply the same day.
                  </p>
                </section>
              )}
            </div>

            <Highlights destination={dest} guide={guide} />
            <TravelTips destination={dest} guide={guide} />
            <SafetyAndEmergency destination={dest} guide={guide} alerts={alerts} />
          </>
        )}

        {/* Fallback for a destination with no guide written yet: the entry rules
            still show if we have them, so the page is never plans-only. */}
        {!guide && customs && <EntryRequirements customs={customs} />}

        {/* ── Only now, the product ──────────────────────────────────────────
            Everything above answers the trip. This answers one part of it. */}
        <section id="plans" className="scroll-mt-24 pt-4">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
              Staying connected
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-white">
              Data for {dest.name}
            </h2>
            <p className="mt-3 leading-relaxed text-white/70">
              Install before you fly, switch it on when you land. Your Cambodian number keeps
              working for calls and SMS.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} destination={dest} dark />
            ))}
          </div>
        </section>

        <div>
          <DeviceChecker dark />
        </div>

        {/* Installation guide */}
        <div id="install">
          <h2 className="mb-6 font-display text-2xl font-bold text-white">Installation guide</h2>
          <Accordion dark>
            <AccordionItem title="iPhone installation steps" defaultOpen>
              <ol className="list-inside list-decimal space-y-2">
                <li>Open <strong>Settings → Cellular → Add eSIM</strong></li>
                <li>Tap <strong>Use QR Code</strong> and scan the QR we send you</li>
                <li>Label the new plan &quot;{dest.name} Trip&quot;</li>
                <li>Keep the eSIM <strong>OFF</strong> until you land in {dest.name}</li>
                <li>After landing: turn the eSIM on and enable <strong>Data Roaming</strong> for it</li>
              </ol>
            </AccordionItem>
            <AccordionItem title="Android installation steps">
              <ol className="list-inside list-decimal space-y-2">
                <li>Open <strong>Settings → Connections → SIM Manager → Add eSIM</strong></li>
                <li>Choose <strong>Scan QR code</strong> and scan the QR we send you</li>
                <li>Confirm the download and name it &quot;{dest.name} Trip&quot;</li>
                <li>Keep mobile data on your Cambodian SIM until departure</li>
                <li>After landing: switch mobile data to the new eSIM and enable roaming</li>
              </ol>
            </AccordionItem>
          </Accordion>
        </div>

        {/* FAQ */}
        <div id="faq">
          <h2 className="mb-6 font-display text-2xl font-bold text-white">
            {dest.name} eSIM — frequently asked questions
          </h2>
          <Accordion dark>
            <AccordionItem title={`When should I activate my ${dest.name} eSIM?`}>
              Install the eSIM before you fly, but only turn it on after you land in {dest.name}.
              The validity period starts when the eSIM first connects to a local network.
            </AccordionItem>
            <AccordionItem title="Can I share data with my travel partner?">
              Yes — all Domner plans include hotspot/tethering, so you can share your connection
              with family members&apos; phones.
            </AccordionItem>
            <AccordionItem title={`Which networks will I connect to in ${dest.name}?`}>
              Your eSIM automatically connects to {dest.networks.join(' or ')} — whichever has the
              strongest signal where you are. Expect {dest.networkTech} speeds in cities.
            </AccordionItem>
            <AccordionItem title="What if I run out of data?">
              Message our 24/7 Khmer support on Telegram and we&apos;ll top you up in minutes — no
              need to buy a new eSIM.
            </AccordionItem>
            <AccordionItem title="Does my number change?">
              Your Cambodian number stays active for calls/SMS (roaming charges may apply if you
              answer). The eSIM is data-only, and apps like Telegram keep working with your normal
              number over data.
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
