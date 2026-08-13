'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Plane, MonitorSmartphone } from 'lucide-react';
import { useFlightTracking } from '@/hooks/useFlightTracking';
import { FlightDashboard } from '@/components/flights/FlightDashboard';
import { FlightLiveTracker } from '@/components/flights/FlightLiveTracker';
import { FlightRouteGlobe } from '@/components/flights/FlightRouteGlobe';
import { DelayIntelligence } from '@/components/flights/DelayIntelligence';
import { TravelMode } from '@/components/flights/TravelMode';
import { NotifyModal } from '@/components/flights/NotifyModal';
import { ShareModal } from '@/components/flights/ShareModal';
import { FlightCardSkeleton } from '@/components/ui/Skeleton';
import { getAirportCoords } from '@/lib/airportCoords';
import { haversineKm, type LiveFlightData } from '@/lib/liveFlight';
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
  const [liveProgress, setLiveProgress] = useState<number | null>(null);
  const [liveFix, setLiveFix] = useState<LiveFlightData | null>(null);
  const [travelMode, setTravelMode] = useState(false);
  const prevRef = useRef<{ gate?: string; status?: string }>({});

  // Fire a tray notification when the gate or status changes while tracking.
  useEffect(() => {
    if (!flight || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      if (flight) prevRef.current = { gate: flight.departure.gate, status: flight.status };
      return;
    }
    const prev = prevRef.current;
    if (prev.gate && flight.departure.gate && prev.gate !== flight.departure.gate) {
      new Notification(`✈️ ${flight.flightNumber} — Gate change!`, {
        body: `Gate ${prev.gate} → ${flight.departure.gate}. ជើងហោះហើរផ្លាស់ទ្វារ!`,
        tag: 'domner-flight',
        icon: '/icons/icon-192.png',
      });
    } else if (prev.status && prev.status !== flight.status) {
      new Notification(`✈️ ${flight.flightNumber} — ${flight.status.replace('-', ' ').toUpperCase()}`, {
        body: `${flight.departure.airport} → ${flight.arrival.airport}`,
        tag: 'domner-flight',
        icon: '/icons/icon-192.png',
      });
    }
    prevRef.current = { gate: flight.departure.gate, status: flight.status };
  }, [flight]);

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
    // night-canvas, not a bespoke gradient: it is the class body:has() looks for
    // to darken the document, without which the sticky header frosts a white
    // strip across the top of the page. See app/globals.css.
    <div className="night-canvas has-tabbar relative min-h-screen overflow-hidden">
      <div className="stars" aria-hidden="true" />
      <div className="stars-far" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/flights"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft size={16} /> Search another flight
          </Link>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={13} /> Refresh · auto-updates every 90s
          </button>
        </div>

        {loading && !flight && <FlightCardSkeleton />}

        {error && !flight && (
          <div className="flex flex-col items-center rounded-card border border-white/10 bg-white/5 px-6 py-16 text-center backdrop-blur">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <Plane size={26} className="text-accent" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-lg font-bold text-white">Flight not found</h2>
            <p className="mt-1.5 max-w-sm text-sm text-white/60">
              We couldn&apos;t find {flightNumber} on {date}. Check the flight number and date.
            </p>
            <Link
              href="/flights"
              className="liquid-glass-accent liquid-sheen mt-6 rounded-btn px-5 py-2.5 text-sm font-semibold text-white"
            >
              Try again
            </Link>
          </div>
        )}

        {flight && (
          <>
            {flight.demo && (
              <p className="mb-4 rounded-card border border-white/15 bg-white/5 px-4 py-3 text-xs text-white/60 backdrop-blur">
                ℹ️ Schedule times/gates below are <strong className="text-white/85">simulated</strong>{' '}
                (connect an AeroDataBox key for real airline schedules). The{' '}
                <strong className="text-white/85">live aircraft tracking</strong> further down is real —
                it uses the ADS-B network and needs no key.
              </p>
            )}
            <FlightDashboard
              flight={liveProgress !== null ? { ...flight, progress: liveProgress, status: 'active' } : flight}
              onNotify={() => setNotifyOpen(true)}
              onShare={() => setShareOpen(true)}
              onSave={saveToTrip}
            />
            {/* Seatback route view: engine-driven globe framed on the route,
                fed by the same live poll as the tracker below. */}
            <FlightRouteGlobe flight={flight} live={liveFix} />
            <DelayIntelligence flightNumber={flightNumber} date={date} />
            {/* Travel Mode: full-screen always-awake card for the travel day */}
            <button
              type="button"
              onClick={() => setTravelMode(true)}
              className="liquid-glass liquid-sheen mt-4 flex w-full items-center justify-center gap-2.5 rounded-card px-5 py-4 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
            >
              <MonitorSmartphone size={18} className="text-accent" aria-hidden="true" />
              Travel Mode — keep my flight on screen
              <span className="hidden font-khmer text-xs text-white/50 sm:inline">· បង្ហាញនៅលើអេក្រង់ជានិច្ច</span>
            </button>

            <FlightLiveTracker
              flightNumber={flightNumber}
              depIata={flight.departure.airport}
              arrIata={flight.arrival.airport}
              onLive={(live) => {
                // One poll feeds both the route globe and the progress bar.
                setLiveFix(live);
                // Derive true progress from the aircraft's real position
                // along the route (distance flown ÷ total route distance).
                if (!live || live.onGround) {
                  setLiveProgress(null);
                  return;
                }
                const dep = getAirportCoords(flight.departure.airport);
                const arr = getAirportCoords(flight.arrival.airport);
                if (!dep || !arr) return;
                const total = haversineKm(dep, arr);
                if (total < 50) return;
                const flown = haversineKm(dep, [live.lat, live.lon]);
                setLiveProgress(Math.min(98, Math.max(2, Math.round((flown / total) * 100))));
              }}
            />
            {savedToTrip && (
              <p className="mt-4 rounded-btn border border-success/40 bg-success/15 p-3.5 text-center text-sm font-medium text-emerald-300 animate-fade-up">
                Saved! You&apos;ll find this flight in your dashboard.
              </p>
            )}

            {travelMode && (
              <TravelMode
                flight={liveProgress !== null ? { ...flight, progress: liveProgress, status: 'active' } : flight}
                onClose={() => setTravelMode(false)}
              />
            )}

            <NotifyModal
              open={notifyOpen}
              onClose={() => setNotifyOpen(false)}
              flightNumber={flight.flightNumber}
              date={date}
            />
            <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} flight={flight} date={date} />

            {/* Airport guide cross-link */}
            <div className="liquid-glass mt-8 rounded-card p-6">
              <h2 className="font-display font-bold text-white">Before your flight</h2>
              <p className="mt-1.5 text-sm text-white/60">
                First time at {flight.departure.city} airport? Our step-by-step guide walks you from
                check-in to boarding — in Khmer.
              </p>
              <Link
                href={`/airport-guide?airport=${flight.departure.airport}`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-gold-light"
              >
                Open {flight.departure.airport} airport guide →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
