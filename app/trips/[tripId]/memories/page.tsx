import type { Metadata } from 'next';
import { MemoriesView } from '@/components/travel/MemoriesView';

export const metadata: Metadata = {
  title: 'Memories',
  description: 'Notes and moments from a trip.',
  robots: { index: false, follow: false },
};

// This page used to render six hardcoded emoji — Wat Arun, boat noodles,
// Pattaya — plus invented statistics ("5.4 GB used", "2 flights", "6 places
// visited") and a share URL pointing at a route that does not exist. Every trip
// showed the same six moments. `trip_memories` has been in the schema since the
// beginning and was never read or written.
export default function TripMemoriesPage({ params }: { params: { tripId: string } }) {
  return <MemoriesView tripId={params.tripId} />;
}
