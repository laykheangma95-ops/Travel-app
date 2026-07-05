'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { getRecentSearches, saveRecentSearch } from '@/hooks/useFlightTracking';
import { todayIso } from '@/lib/utils';

export default function FlightTrackerPage() {
  const router = useRouter();
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState(todayIso());
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setRecent(getRecentSearches()), []);

  const track = (num: string) => {
    const cleaned = num.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleaned) return;
    saveRecentSearch(cleaned);
    router.push(`/flights/${cleaned}?date=${date}`);
  };

  return (
    <div className="relative min-h-[80vh] overflow-hidden bg-[linear-gradient(180deg,#04070F_0%,#0A1628_45%,#1B2A5B_100%)]">
      <div className="stars" aria-hidden="true" />
      <div className="stars-far" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          {/* Glowing orb — the Flight Guardian "eye" */}
          <div
            className="mx-auto mb-8 h-16 w-16 animate-orb-pulse rounded-full bg-[radial-gradient(circle_at_32%_28%,#DBEAFE_0%,#60A5FA_38%,#1D4ED8_75%,#0F2A6B_100%)]"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Flight Guardian</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Track any flight, live.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Gate changes, delays, boarding calls — Domner tells you before the airport screens do.
          </p>
        </div>

        {/* Search card */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            track(flightNumber);
          }}
          className="liquid-glass mt-10 flex flex-col gap-3 rounded-card p-5 sm:flex-row"
        >
          <input
            type="text"
            value={flightNumber}
            onChange={(e) => setFlightNumber(e.target.value)}
            placeholder="Flight Number e.g. QH215"
            aria-label="Flight number"
            className="flex-1 rounded-btn border border-white/20 bg-white/10 px-4 py-3.5 font-mono text-sm uppercase text-white placeholder:text-white/40 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Flight date"
            className="rounded-btn border border-white/20 bg-white/10 px-4 py-3.5 text-sm text-white backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
          />
          <button
            type="submit"
            className="liquid-glass-accent liquid-sheen inline-flex items-center justify-center gap-2 rounded-btn px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 active:scale-[0.98]"
          >
            <Search size={16} /> Track Flight →
          </button>
        </form>

        {/* Recent searches */}
        {recent.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-white/50">Recent:</span>
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => track(r)}
                className="rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 font-mono text-xs text-white/80 transition-colors hover:border-accent hover:text-accent"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Popular flights hint */}
        <div className="mt-14 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">Popular routes from Cambodia</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['QH215', 'K6720', 'PG934', 'VN841', 'SQ157'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => track(f)}
                className="rounded-full border border-white/15 px-4 py-2 font-mono text-sm text-white/70 transition-all duration-200 hover:border-accent hover:text-white"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
