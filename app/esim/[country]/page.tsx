import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, Signal } from 'lucide-react';
import { destinations, getDestination } from '@/data/destinations';
import { getPlansForCountry } from '@/data/esimPlans';
import { getCustomsRule } from '@/data/customsRules';
import { carriersInCountry, destinationsServing, getServedCountry, servedCountries } from '@/data/coverage';
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

/**
 * Resolve a URL segment to the country being shopped for and the destination
 * SKU that actually serves it.
 *
 * Two cases. A destination slug (`/esim/japan`, `/esim/europe`) behaves exactly
 * as it always has. A covered-but-unsold country (`/esim/italy`) has no SKU of
 * its own, so it sells the cheapest plan that reaches it — the Europe eSIM —
 * while the page still speaks about Italy.
 */
function resolvePage(slug: string) {
  const direct = getDestination(slug);
  if (direct) {
    return { dest: direct, displayName: direct.name, flag: direct.flag, servedVia: null };
  }

  const country = getServedCountry(slug);
  const via = country ? destinationsServing(slug)[0] : undefined;
  if (!country || !via) return null;

  return { dest: via, displayName: country.name, flag: country.flag, servedVia: via };
}

export function generateStaticParams() {
  // Both the SKUs and every country they cover, so a traveller searching Italy
  // lands on a real page instead of a 404.
  const slugs = new Set([...destinations.map((d) => d.slug), ...servedCountries.map((c) => c.slug)]);
  return [...slugs].map((country) => ({ country }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = resolvePage(params.country);
  if (!page) return { title: 'Destination not found' };
  const { dest, displayName } = page;
  return {
    title: `${displayName} eSIM Plans`,
    description: `Instant ${displayName} eSIM from $${dest.fromPriceUsd.toFixed(2)}. ${dest.networkTech} on ${dest.networks.join(' & ')}. Khmer support included.`,
  };
}

export default function CountryPlansPage({ params }: PageProps) {
  const page = resolvePage(params.country);
  if (!page) notFound();

  const { dest, displayName, flag, servedVia } = page;
  const plans = getPlansForCountry(dest.slug);
  const customs = getCustomsRule(params.country) ?? getCustomsRule(dest.slug);

  // A bundle does not use the same carrier everywhere: the Europe eSIM is on
  // Free Mobile in France and on 3 in Italy. Prefer the country-specific list.
  const localCarriers = servedVia ? carriersInCountry(dest.slug, params.country) : [];
  const networks = localCarriers.length > 0 ? localCarriers : dest.networks;

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
                <WavyFlag flag={flag} label={`${displayName} flag`} size={92} />
                <div>
                  <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
                    {displayName} eSIM Plans
                  </h1>
                  <p className="mt-1.5 flex items-center gap-2 text-sm text-white/70">
                    <Signal size={15} aria-hidden="true" />
                    Powered by {networks.join(' & ')} network
                  </p>
                </div>
              </div>

              {/* Say which product this is before they pay, not after. Someone
                  who reached /esim/italy is buying the Europe eSIM, and the
                  order confirmation will say Europe. */}
              {servedVia && (
                <p className="mt-4 max-w-lg rounded-card border border-gold-light/25 bg-gold-light/10 px-4 py-3 text-sm text-white/80">
                  {displayName} is covered by our{' '}
                  <span className="font-semibold text-white">{servedVia.name}</span> eSIM — one plan
                  that works across the whole region. That&rsquo;s the plan you&rsquo;ll receive.
                </p>
              )}
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
        <PlanSpecs countrySlug={dest.slug} countryName={displayName} plans={plans} />

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
                <li>Label the new plan &quot;{displayName} Trip&quot;</li>
                <li>Keep the eSIM <strong>OFF</strong> until you land in {displayName}</li>
                <li>After landing: turn the eSIM on and enable <strong>Data Roaming</strong> for it</li>
              </ol>
            </AccordionItem>
            <AccordionItem title="🤖 Android installation steps">
              <ol className="list-inside list-decimal space-y-2">
                <li>Open <strong>Settings → Connections → SIM Manager → Add eSIM</strong></li>
                <li>Choose <strong>Scan QR code</strong> and scan the QR we send you</li>
                <li>Confirm the download and name it &quot;{displayName} Trip&quot;</li>
                <li>Keep mobile data on your Cambodian SIM until departure</li>
                <li>After landing: switch mobile data to the new eSIM and enable roaming</li>
              </ol>
            </AccordionItem>
          </Accordion>
        </div>

        {/* FAQ */}
        <div className="mt-14" id="faq">
          <h2 className="mb-6 font-display text-2xl font-bold text-white">
            {displayName} eSIM — frequently asked questions
          </h2>
          <Accordion dark>
            <AccordionItem title={`When should I activate my ${displayName} eSIM?`}>
              Install the eSIM before you fly, but only turn it on after you land in {displayName}.
              The validity period starts when the eSIM first connects to a local network.
            </AccordionItem>
            <AccordionItem title="Can I share data with my travel partner?">
              Yes — all Domner plans include hotspot/tethering, so you can share your connection
              with family members&apos; phones.
            </AccordionItem>
            <AccordionItem title={`Which networks will I connect to in ${displayName}?`}>
              Your eSIM automatically connects to {networks.join(' or ')} — whichever has the
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
