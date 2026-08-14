import type { Metadata } from 'next';
import { ItineraryShareView } from '@/components/travel/ItineraryShareView';

export const metadata: Metadata = { title: 'Shared itinerary', robots: { index: false, follow: false } };

export default function SharedTripPage({ params }: { params: { token: string } }) {
  return <ItineraryShareView token={params.token} />;
}