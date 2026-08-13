import type { Metadata } from 'next';
import { TripsView } from '@/components/travel/TripsView';

export const metadata: Metadata = {
  title: 'Trips',
  description: 'Every journey in one place — flights, stay, eSIM, places and itinerary.',
  robots: { index: false, follow: false },
};

// /trips is now the real trips workspace. It used to redirect into the
// dashboard's demo list, which showed every visitor the same two invented trips.
export default function TripsPage() {
  return <TripsView />;
}
