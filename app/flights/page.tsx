'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, Search } from 'lucide-react';
import { getRecentSearches, saveRecentSearch } from '@/hooks/useFlightTracking';
import type { FlightSuggestion } from '@/lib/aeroDataBox';
import { todayIso } from '@/lib/utils';
import { useLang } from '@/lib/i18n';

export default function FlightTrackerPage() {
  const { t } = useLang();
  const router = useRouter();
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState(todayIso());
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<FlightSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setRecent(getRecentSearches()), []);

  const track = (num: string) => {
    const cleaned = num.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleaned) return;
    saveRecentSearch(cleaned);
    router.push(`/flights/${cleaned}?date=${date}`);
  };

  // Autocomplete: debounce keystrokes, then fetch matching flight numbers.
  const onQueryChange = (value: string) => {
    setFlightNumber(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/flights/suggest?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: FlightSuggestion[] };
        setSuggestions(data.suggestions);
        setShowSuggestions(data.suggestions.length > 0);
      } catch {
        // suggestions are best-effort
      }
    }, 250);
  };

  return (
    <div className="relative min-h-[80vh] overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_45%,#23406A_100%)]">
      <div className="stars" aria-hidden="true" />
      <div className="stars-far" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          {/* Glowing orb — the Flight Guardian "eye" */}
          <div
            className="mx-auto mb-8 h-16 w-16 animate-orb-pulse rounded-full bg-[radial-gradient(circle_at_32%_28%,#DBEAFE_0%,#60A5FA_38%,#1D4ED8_75%,#0F2A6B_100%)]"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">{t('flights.eyebrow')}</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            {t('flights.title')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-white/70">{t('flights.sub')}</p>
        </div>

        {/* Search card */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            track(flightNumber);
          }}
          className="glass-panel mt-10 flex flex-col gap-3 rounded-card p-5 sm:flex-row"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={flightNumber}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => e.key === 'Escape' && setShowSuggestions(false)}
              placeholder={t('flights.numberPlaceholder')}
              aria-label={t('flights.numberLabel')}
              aria-expanded={showSuggestions}
              aria-controls="flight-suggestions"
              role="combobox"
              autoComplete="off"
              className="w-full rounded-btn border border-white/20 bg-white/10 px-4 py-3.5 font-mono text-sm uppercase text-white placeholder:text-white/40 backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && (
              <ul
                id="flight-suggestions"
                role="listbox"
                aria-label={t('flights.matching')}
                className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-card border border-white/15 bg-[#1C3355]/95 shadow-card-hover backdrop-blur-xl animate-fade-up"
              >
                {suggestions.map((s) => (
                  <li key={s.number} role="option" aria-selected="false">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        track(s.number);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/10"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                        <Plane size={14} className="text-accent" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-bold text-white">{s.number}</span>
                        <span className="block truncate text-xs text-white/50">{s.airline}</span>
                      </span>
                      {s.route && (
                        <span className="shrink-0 font-mono text-xs font-semibold text-white/70">{s.route}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t('flights.dateLabel')}
            className="rounded-btn border border-white/20 bg-white/10 px-4 py-3.5 text-sm text-white backdrop-blur focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
          />
          <button
            type="submit"
            className="liquid-glass-accent liquid-sheen inline-flex items-center justify-center gap-2 rounded-btn px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 active:scale-[0.98]"
          >
            <Search size={16} /> {t('flights.track')}
          </button>
        </form>

        {/* Recent searches */}
        {recent.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-white/50">{t('flights.recent')}</span>
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
          <p className="text-xs uppercase tracking-widest text-white/40">{t('flights.popular')}</p>
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
