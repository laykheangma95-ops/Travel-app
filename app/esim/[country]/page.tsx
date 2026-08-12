import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, Signal } from 'lucide-react';
import { destinations, getDestination } from '@/data/destinations';
import { getPlansForCountry } from '@/data/esimPlans';
import { getCustomsRule } from '@/data/customsRules';
import { PlanCard } from '@/components/esim/PlanCard';
import { PlanSpecs } from '@/components/esim/PlanSpecs';
import { PlanTrustPanel } from '@/components/esim/PlanTrustPanel';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { DeviceChecker } from '@/components/esim/DeviceChecker';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';

interface PageProps {
  params: { country: string };
}

export function generateStaticParams() {
  return destinations.map((d) => ({ country: d.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const dest = getDestination(params.country);
  if (!dest) return { title: 'Destination not found' };
  return {
    title: `${dest.name} eSIM Plans`,
    description: `Instant ${dest.name} eSIM from $${dest.fromPriceUsd.toFixed(2)}. ${dest.networkTech} on ${dest.networks.join(' & ')}. Khmer support included.`,
  };
}

export default function CountryPlansPage({ params }: PageProps) {
  const dest = getDestination(params.country);
  if (!dest) notFound();

  const plans = getPlansForCountry(dest.slug);
  const customs = getCustomsRule(dest.slug);

  return (
    // One continuous night sky for the whole plan page — hero flows into the
    // body so the funnel never drops into flat light (.claude/skills/ui-ux §9).
    <div className="night-canvas">
      <div className="night-stars" aria-hidden="true" />
      {/* Hero */}
      <section className="relative overflow-hidden py-16">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-4">
                <WavyFlag flag={dest.flag} label={`${dest.name} flag`} size={92} />
                <div>
                  <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
                    {dest.name} eSIM Plans
                  </h1>
                  <p className="mt-1.5 flex items-center gap-2 text-sm text-white/70">
                    <Signal size={15} aria-hidden="true" />
                    Powered by {dest.networks.join(' & ')} network
                  </p>
                </div>
              </div>
            </div>
            {/* Coverage map placeholder */}
            <div className="liquid-glass hidden items-center gap-3 rounded-card px-6 py-4 md:flex">
              <MapPin size={20} className="text-accent" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-white">Nationwide coverage</p>
                <p className="text-xs text-white/60">
                  {dest.networkTech} · {dest.networkQuality} quality
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6">
        {/* Plans */}
        <div className="grid gap-6 pt-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} destination={dest} dark />
          ))}
        </div>

        {/* Everything a customer needs to know before paying — sourced facts
            only, and the support promise that covers the rest. */}
        <PlanSpecs countrySlug={dest.slug} countryName={dest.name} plans={plans} />

        <PlanTrustPanel />

        {customs && (
          <div className="mt-12 night-card p-6">
            <div className="flex items-start gap-3">
              <Badge tone="warning">Entry info</Badge>
            </div>
            <p className="mt-3 text-sm font-medium text-white">{customs.visaInfo}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/70">
              {customs.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Device compatibility */}
        <div className="mt-14">
          <DeviceChecker dark />
        </div>

        {/* Installation guide */}
        <div className="mt-14" id="install">
          <h2 className="mb-6 font-display text-2xl font-bold text-white">Installation guide</h2>
          <Accordion dark>
            <AccordionItem title="📱 iPhone installation steps" defaultOpen>
              <ol className="list-inside list-decimal space-y-2">
                <li>Open <strong>Settings → Cellular → Add eSIM</strong></li>
                <li>Tap <strong>Use QR Code</strong> and scan the QR we send you</li>
                <li>Label the new plan &quot;{dest.name} Trip&quot;</li>
                <li>Keep the eSIM <strong>OFF</strong> until you land in {dest.name}</li>
                <li>After landing: turn the eSIM on and enable <strong>Data Roaming</strong> for it</li>
              </ol>
            </AccordionItem>
            <AccordionItem title="🤖 Android installation steps">
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
        <div className="mt-14" id="faq">
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
