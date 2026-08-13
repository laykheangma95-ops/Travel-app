import type { Metadata } from 'next';
import { TripForm } from '@/components/travel/TripForm';

export const metadata: Metadata = {
  title: 'New trip',
  description: 'Start a journey — destination, dates and who is going.',
  robots: { index: false, follow: false },
};

// The destination of the "New trip" button, which until now pointed at the
// packing checklist because no trip creator existed.
export default function NewTripPage() {
  return <TripForm />;
}
