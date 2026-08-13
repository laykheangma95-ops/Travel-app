import type { Metadata } from 'next';
import { PlanFinder } from '@/components/esim/PlanFinder';
import { destinations } from '@/data/destinations';

export const metadata: Metadata = {
  title: 'Find my eSIM — Domner',
  description:
    'Answer three quick questions and we will pick the right data plan for your trip. No guessing at gigabytes.',
};

/**
 * /esim/finder — the guided route into the store.
 *
 * `?country=japan` skips the first question, so the destination pages can send
 * someone straight in with the answer they have already given by being there.
 */
export default function EsimFinderPage({
  searchParams,
}: {
  searchParams?: { country?: string };
}) {
  const requested = searchParams?.country;
  const initialCountry = destinations.some((d) => d.slug === requested) ? requested : undefined;

  return (
    <div className="night-canvas min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* The heading is inside PlanFinder so it can read useLang() — this
            route is a server component and the customer UI is Khmer-first. */}
        <PlanFinder initialCountry={initialCountry} />
      </div>
    </div>
  );
}
