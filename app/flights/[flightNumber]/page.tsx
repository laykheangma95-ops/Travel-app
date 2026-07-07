'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useFlightTracking } from '@/hooks/useFlightTracking';
import { FlightDashboard } from '@/components/flights/FlightDashboard';
import { FlightLiveTracker } from '@/components/flights/FlightLiveTracker';
import { NotifyModal } from '@/components/flights/NotifyModal';
import { ShareModal } from '@/components/flights/ShareModal';
import { FlightCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Plane } from 'lucide-react';
import { todayIso } from '@/lib/utils';

export default function FlightDetailPage() {
  const params = useParams<{ flightNumber: string }>();
  const searchParams = useSearchParams();
  const date = searchParams.get('date') ?? todayIso();
  const flightNumber = decodeURIComponent(params.flightNumber);

  const { flight, loading, error, refresh } = useFlightTracking(flightNumber, date);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [savedToTrip, setSavedToTrip] = useState(false);

  const saveToTrip = async () => {
    await fetch('/api/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightNumber, date }),
    }).catch(() => undefined);
    setSavedToTrip(true);
    setTimeout(() => setSavedToTrip(false), 2000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/flights"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary transition-colors hover:text-secondary"
        >
          <ArrowLeft size={16} /> Search another flight
        </Link>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <RefreshCw size={13} /> Refresh · auto-updates every 90s
        </button>
      </div>

      {loading && !flight && <FlightCardSkeleton />}

      {error && !flight && (
        <EmptyState
          icon={Plane}
          title="Flight not found"
          description={`We couldn't find ${flightNumber} on ${date}. Check the flight number and date.`}
          ctaLabel="Try again"
          ctaHref="/flights"
        />
      )}

      {flight && (
        <>
          {flight.demo && (
            <p className="mb-4 rounded-card border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-ink-secondary">
              ℹ️ Schedule times/gates below are <strong>simulated</strong> (connect an AeroDataBox
              key for real airline schedules). The <strong>live aircraft tracking</strong> further
              down is real — it uses the ADS-B network and needs no key.
            </p>
          )}
          <FlightDashboard
            flight={flight}
            onNotify={() => setNotifyOpen(true)}
            onShare={() => setShareOpen(true)}
            onSave={saveToTrip}
          />
          <FlightLiveTracker flightNumber={flightNumber} />
          {savedToTrip && (
            <p className="mt-4 rounded-btn bg-emerald-50 p-3.5 text-center text-sm font-medium text-success animate-fade-up">
              Saved! You&apos;ll find this flight in your dashboard.
            </p>
          )}

          <NotifyModal
            open={notifyOpen}
            onClose={() => setNotifyOpen(false)}
            flightNumber={flight.flightNumber}
            date={date}
          />
          <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} flight={flight} date={date} />

          {/* Airport guide cross-link */}
          <div className="mt-8 rounded-card border border-line/60 bg-white p-6 shadow-card">
            <h2 className="font-display font-bold text-ink">Before your flight</h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              First time at {flight.departure.city} airport? Our step-by-step guide walks you from
              check-in to boarding — in Khmer.
            </p>
            <Link
              href={`/airport-guide?airport=${flight.departure.airport}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary transition-colors hover:text-accent"
            >
              Open {flight.departure.airport} airport guide →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
