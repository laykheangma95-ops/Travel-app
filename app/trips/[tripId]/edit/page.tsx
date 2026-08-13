import type { Metadata } from 'next';
import { EditTripView } from '@/components/travel/EditTripView';

export const metadata: Metadata = {
  title: 'Edit trip',
  robots: { index: false, follow: false },
};

export default function EditTripPage({ params }: { params: { tripId: string } }) {
  return <EditTripView tripId={params.tripId} />;
}
