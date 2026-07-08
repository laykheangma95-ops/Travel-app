'use client';

// Public flight tracking — no login required. Share tokens encode
// flightnumber-date (e.g. qh215-2025-01-15); real installs also persist a
// share row in Supabase via /api/flights.

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Download, Users } from 'lucide-react';
import { useFlightTracking } from '@/hooks/useFlightTracking';
import { FlightDashboard } from '@/components/flights/FlightDashboard';
import { DomerLogo } from '@/components/brand/DomerMark';
import { FlightCardSkeleton } from '@/components/ui/Skeleton';
import { todayIso } from '@/lib/utils';

export default function PublicTrackPage() {
  const params = useParams<{ token: string }>();

  const { flightNumber, date } = useMemo(() => {
    const token = decodeURIComponent(params.token);
    const match = token.match(/^([a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/i);
    if (match) return { flightNumber: match[1].toUpperCase(), date: match[2] };
    return { flightNumber: token.toUpperCase(), date: todayIso() };
  }, [params.token]);

  const { flight, loading } = useFlightTracking(flightNumber, date);

  const localTime = (tz: string) => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      }).format(new Date());
    } catch {
      return '—';
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_50%,#23406A_100%)] pb-28">
      <div className="stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <span className="inline-flex justify-center">
            <DomerLogo surface="navy" />
          </span>
          <p className="mt-1 text-sm text-white/60">Live flight tracking · ការតាមដានជើងហោះហើរផ្ទាល់</p>
        </div>

        {loading && !flight ? (
          <FlightCardSkeleton />
        ) : flight ? (
          <>
            <FlightDashboard flight={flight} compact />

            {/* Current local times */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="glass-panel rounded-card p-5 text-center">
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Time in {flight.departure.city}
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-white">
                  {localTime(flight.departure.timezone)}
                </p>
              </div>
              <div className="glass-panel rounded-card p-5 text-center">
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Time in {flight.arrival.city}
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-white">
                  {localTime(flight.arrival.timezone)}
                </p>
              </div>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-white/60">
              <Users size={14} aria-hidden="true" />
              {flight.trackerCount ?? 1} people are tracking this flight
            </p>
          </>
        ) : (
          <div className="glass-panel rounded-card p-10 text-center text-white/70">
            This tracking link has expired or the flight was not found.
          </div>
        )}
      </div>

      {/* Download banner */}
      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-primary/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-semibold text-white">Get Domer</p>
            <p className="text-xs text-white/60">eSIM + flight alerts + airport guide, in Khmer</p>
          </div>
          <Link
            href="/"
            className="liquid-glass-accent liquid-sheen inline-flex shrink-0 items-center gap-2 rounded-btn px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            <Download size={15} /> Open Domer
          </Link>
        </div>
      </div>
    </div>
  );
}
