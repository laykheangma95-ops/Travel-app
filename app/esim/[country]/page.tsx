import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { destinations, getDestination } from '@/data/destinations';
import { getPlansForCountry } from '@/data/esimPlans';
import { getCustomsRule } from '@/data/customsRules';
import { PlanCard } from '@/components/esim/PlanCard';
import { PlanSpecs } from '@/components/esim/PlanSpecs';
import { PlanTrustPanel } from '@/components/esim/PlanTrustPanel';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { DeviceChecker } from '@/components/esim/DeviceChecker';
import { Badge } from '@/components/ui/Badge';
import {
  CountryFaq,
  CountryHeading,
  CoverageBadge,
  EntryInfoLabel,
  InstallGuide,
} from '@/components/esim/CountryPlanCopy';

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
                <CountryHeading country={dest.name} networks={dest.networks} />
              </div>
            </div>
            {/* Coverage map placeholder */}
            <CoverageBadge tech={dest.networkTech} quality={dest.networkQuality} />
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
              <Badge tone="warning">
                <EntryInfoLabel />
              </Badge>
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
          <InstallGuide country={dest.name} />
        </div>

        {/* FAQ */}
        <div className="mt-14" id="faq">
          <CountryFaq dest={dest} />
        </div>
      </div>
    </div>
  );
}
