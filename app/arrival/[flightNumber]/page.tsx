'use client';

// Arrival Experience page — opened from the "flight landed" push notification.

import { useParams, useSearchParams } from 'next/navigation';
import { useFlightTracking } from '@/hooks/useFlightTracking';
import { ArrivalExperience } from '@/components/flights/ArrivalExperience';
import { FlightCardSkeleton } from '@/components/ui/Skeleton';
import { todayIso } from '@/lib/utils';

export default function ArrivalPage() {
  const params = useParams<{ flightNumber: string }>();
  const searchParams = useSearchParams();
  const date = searchParams.get('date') ?? todayIso();
  const flightNumber = decodeURIComponent(params.flightNumber);

  const { flight, loading } = useFlightTracking(flightNumber, date);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {loading && !flight ? (
        <FlightCardSkeleton />
      ) : flight ? (
        <ArrivalExperience flight={flight} />
      ) : (
        <p className="text-center text-ink-secondary">Flight not found.</p>
      )}
    </div>
  );
}
