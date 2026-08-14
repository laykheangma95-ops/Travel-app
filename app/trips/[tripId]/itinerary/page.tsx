import type { Metadata } from 'next';
import { ItineraryEditor } from '@/components/travel/ItineraryEditor';

export const metadata: Metadata = { title: 'Itinerary', robots: { index: false, follow: false } };

export default function ItineraryPage({ params }: { params: { tripId: string } }) {
  return <ItineraryEditor tripId={params.tripId} />;
}