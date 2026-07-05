import { redirect } from 'next/navigation';

// A trip's default view is its memory journal.
export default function TripDetailPage({ params }: { params: { tripId: string } }) {
  redirect(`/trips/${params.tripId}/memories`);
}
