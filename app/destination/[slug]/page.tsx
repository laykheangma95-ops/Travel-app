// The addressable half of the journey.
//
// The homepage owns the flight and never changes route, which is what keeps it
// seamless — but a destination guide has to be linkable, shareable and
// crawlable, and none of that survives inside a client-only state machine. So
// this route renders the identical chapters at a real URL, with no flight: you
// simply arrive.
//
// Same components, two entry points. The homepage pushes this URL when it
// lands, so a visitor who flew here and a visitor who was sent the link end up
// looking at the same address.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuide, guides } from '@/content/destinations';
import { HomepageV3 } from '@/components/home/v3/HomepageV3';
import '../../v3.css';

interface PageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return { title: 'Destination not found' };
  const visa =
    guide.entry.visa.kind === 'visa-free'
      ? 'visa-free'
      : guide.entry.visa.kind === 'check-before-booking'
        ? 'entry rules to check'
        : 'visa required';
  return {
    title: `${guide.city.en} for Cambodian travellers`,
    description: `${guide.city.en}, ${guide.country.en} with a Cambodian passport: ${visa}, entry requirements, money, transport and connectivity. Verified and dated.`,
    alternates: { canonical: `/destination/${guide.slug}` },
    openGraph: {
      title: `${guide.city.en} — for a Cambodian passport`,
      description: guide.arrival.intro.en,
      type: 'article',
    },
  };
}

export default function DestinationPage({ params }: PageProps) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();
  return <HomepageV3 initialSlug={guide.slug} />;
}
