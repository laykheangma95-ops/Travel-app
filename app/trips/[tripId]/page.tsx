import type { Metadata } from 'next';
import { TripWorkspace } from '@/components/travel/TripWorkspace';

export const metadata: Metadata = {
  title: 'Trip',
  robots: { index: false, follow: false },
};

// This route used to redirect straight to /memories, which meant a trip you had
// not taken yet opened on an empty photo journal. A trip is a container for
// everything about that journey (§16) — memories are one section of it.
export default function TripDetailPage({ params }: { params: { tripId: string } }) {
  return <TripWorkspace tripId={params.tripId} />;
}
