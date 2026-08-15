import type { Metadata } from 'next';
import { TripForm } from '@/components/travel/TripForm';

export const metadata: Metadata = {
  title: 'New trip',
  description: 'Start a journey — destination, dates and who is going.',
  robots: { index: false, follow: false },
};

// The destination of the "New trip" button, which until now pointed at the
// packing checklist because no trip creator existed.
//
// `?destination=` lets Explore and the destination guides hand the place over,
// so reading about somewhere and deciding to go is one step rather than two.
export default function NewTripPage({
  searchParams,
}: {
  searchParams: { destination?: string | string[] };
}) {
  const raw = Array.isArray(searchParams.destination)
    ? searchParams.destination[0]
    : searchParams.destination;
  return <TripForm presetDestination={raw ?? null} />;
}
