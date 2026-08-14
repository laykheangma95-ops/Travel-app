import type { Metadata } from 'next';
import { ItineraryStartView } from '@/components/travel/ItineraryStartView';

export const metadata: Metadata = {
  title: 'Build itinerary',
  description: 'Choose how to plan your trip itinerary.',
  robots: { index: false, follow: false },
};

export default async function ItineraryPage({ params }: { params: { id: string } }) {
  return <ItineraryStartView tripId={params.id} />;
}
