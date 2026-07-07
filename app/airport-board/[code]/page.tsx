'use client';

// Live airport departure board — the airport FIDS screens, in your pocket.
// Shows check-in open / boarding / final call / gate closed per flight so
// travelers never have to hunt for a screen in the terminal.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlaneTakeoff, Search, RefreshCw } from 'lucide-react';
import type { BoardFlight, BoardStage } from '@/lib/aeroDataBox';
import { cn } from '@/lib/utils';

const REFRESH_MS = 60_000;

const AIRPORTS = [
  { code: 'KTI', name: 'Phnom Penh Techo' },
  { code: 'PNH', name: 'Phnom Penh Intl' },
  { code: 'SAI', name: 'Siem Reap Angkor' },
  { code: 'BKK', name: 'Bangkok Suvarnabhumi' },
  { code: 'SGN', name: 'Ho Chi Minh City' },
  { code: 'SIN', name: 'Singapore Changi' },
];

const stageConfig: Record<BoardStage, { label: string; labelKm: string; className: string; pulse?: boolean }> = {
  scheduled: { label: 'Scheduled', labelKm: 'តាមកាលវិភាគ', className: 'bg-white/10 text-white/70' },
  'check-in': { label: 'Check-in open', labelKm: 'បើកឆែកអ៊ីន', className: 'bg-emerald-500/20 text-emerald-300' },
  boarding: { label: 'Boarding', labelKm: 'កំពុងឡើងយន្តហោះ', className: 'bg-accent/25 text-orange-300', pulse: true },
  'final-call': { label: 'FINAL CALL', labelKm: 'ការហៅចុងក្រោយ', className: 'bg-red-500/25 text-red-300', pulse: true },
  'gate-closed': { label: 'Gate closed', labelKm: 'ទ្វារបិទ', className: 'bg-white/10 text-white/50' },
  departed: { label: 'Departed', labelKm: 'បានចេញដំណើរ', className: 'bg-blue-500/20 text-blue-300' },
  delayed: { label: 'Delayed', labelKm: 'ពន្យារពេល', className: 'bg-amber-500/20 text-amber-300' },
  cancelled: { label: 'Cancelled', labelKm: 'បានលុបចោល', className: 'bg-red-500/20 text-red-300' },
};

export default function AirportBoardPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = decodeURIComponent(params.code).toUpperCase();

  const [flights, setFlights] = useState<BoardFlight[] | null>(null);
  const [query, setQuery] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fids?airport=${encodeURIComponent(code)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { flights: BoardFlight[] };
      setFlights(data.flights);
      setUpdatedAt(new Date());
    } catch {
      // keep previous board on network hiccups
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    if (!flights) return null;
    const q = query.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter(
      (f) =>
        f.number.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        f.destination.toLowerCase().includes(q) ||
        f.destinationIata.toLowerCase().includes(q) ||
        f.airline.toLowerCase().includes(q)
    );
  }, [flights, query]);

  const isDemo = flights?.some((f) => f.demo);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#04070F_0%,#0A1628_50%,#0B1B38_100%)]">
      <div className="stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-accent">
              <PlaneTakeoff size={15} aria-hidden="true" /> Departures · ការចេញដំណើរ
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {AIRPORTS.find((a) => a.code === code)?.name ?? code} ({code})
            </h1>
            <p className="mt-1 font-mono text-xs text-white/40">
              {updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every 60s`
                : 'Loading board…'}
            </p>
          </div>

          <div className="flex gap-2">
            <select
              value={code}
              onChange={(e) => router.push(`/airport-board/${e.target.value}`)}
              aria-label="Choose airport"
              className="rounded-btn border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm font-semibold text-white backdrop-blur focus:border-accent focus:outline-none [color-scheme:dark]"
            >
              {AIRPORTS.map((a) => (
                <option key={a.code} value={a.code} className="bg-primary">
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh board"
              className="liquid-glass rounded-btn px-3.5 text-white transition-all hover:brightness-110"
            >
              <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Search my flight */}
        <div className="relative mb-6 max-w-md">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find my flight… (e.g. KR937 or Guangzhou)"
            aria-label="Search the departure board"
            className="w-full rounded-btn border border-white/20 bg-white/10 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/35 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {isDemo && (
          <p className="mb-4 rounded-card border border-white/15 bg-white/5 px-4 py-3 text-xs text-white/60 backdrop-blur">
            ℹ️ Demo board shown — with your AeroDataBox key configured, this becomes the real live
            departures at {code}.
          </p>
        )}

        {/* The board */}
        <div className="overflow-hidden rounded-card border border-white/10 bg-[#060B16]/80 shadow-card-hover backdrop-blur">
          {/* Column headers */}
          <div className="hidden grid-cols-[64px_1fr_1.2fr_90px_70px_150px] gap-3 border-b border-white/10 px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-white/35 sm:grid">
            <span>Time</span>
            <span>Flight</span>
            <span>Destination</span>
            <span>Check-in</span>
            <span>Gate</span>
            <span className="text-right">Status</span>
          </div>

          {!filtered && (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-btn bg-white/5" />
              ))}
            </div>
          )}

          {filtered && filtered.length === 0 && (
            <p className="p-10 text-center text-sm text-white/50">
              No flights match “{query}”. Check the flight number on your booking.
            </p>
          )}

          {filtered?.map((f) => {
            const stage = stageConfig[f.stage];
            return (
              <Link
                key={`${f.number}-${f.scheduledTime}`}
                href={`/flights/${f.number.replace(/\s+/g, '')}`}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 border-b border-white/5 px-5 py-4 transition-colors last:border-b-0 hover:bg-white/5 sm:grid-cols-[64px_1fr_1.2fr_90px_70px_150px]"
              >
                <span className="font-mono text-lg font-bold text-white">
                  {f.revisedTime && f.revisedTime !== f.scheduledTime ? (
                    <>
                      <span className="text-amber-300">{f.revisedTime}</span>{' '}
                      <span className="text-xs text-white/30 line-through">{f.scheduledTime}</span>
                    </>
                  ) : (
                    f.scheduledTime
                  )}
                </span>
                <span>
                  <span className="block font-mono font-semibold text-white">{f.number}</span>
                  <span className="block truncate text-xs text-white/45">{f.airline}</span>
                </span>
                <span className="col-span-2 sm:col-span-1">
                  <span className="font-medium text-white">{f.destination}</span>
                  <span className="ml-1.5 font-mono text-xs text-white/40">{f.destinationIata}</span>
                </span>
                <span className="font-mono text-sm text-white/70">{f.checkIn ?? '—'}</span>
                <span className="font-mono text-sm font-bold text-accent">{f.gate ?? '—'}</span>
                <span className="sm:text-right">
                  <span
                    className={cn(
                      'inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide',
                      stage.className,
                      stage.pulse && 'animate-pulse-soft'
                    )}
                  >
                    {stage.label}
                  </span>
                  <span className="ml-2 font-khmer text-[10px] text-white/40 sm:ml-0 sm:mt-0.5 sm:block">
                    {stage.labelKm}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs text-white/35">
          Tap any flight to open live tracking · data refreshes automatically — no need to stare at
          airport screens ✨
        </p>
      </div>
    </div>
  );
}
