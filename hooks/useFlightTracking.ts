'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlightStatus } from '@/types';

const POLL_INTERVAL_MS = 90_000; // AeroDataBox polled every 90 seconds

interface UseFlightTrackingResult {
  flight: FlightStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useFlightTracking(
  flightNumber: string | null,
  date: string | null
): UseFlightTrackingResult {
  const [flight, setFlight] = useState<FlightStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!flightNumber || !date) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/flights?number=${encodeURIComponent(flightNumber)}&date=${encodeURIComponent(date)}`
      );
      if (!res.ok) throw new Error('Flight not found');
      const data = (await res.json()) as FlightStatus;
      setFlight(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load flight');
    } finally {
      setLoading(false);
    }
  }, [flightNumber, date]);

  useEffect(() => {
    if (!flightNumber || !date) {
      setFlight(null);
      return;
    }
    setLoading(true);
    void fetchStatus();
    timerRef.current = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [flightNumber, date, fetchStatus]);

  return { flight, loading, error, refresh: () => void fetchStatus() };
}

// Recent searches persisted locally so users can re-track with one tap.
const RECENT_KEY = 'domner-recent-flights';

export function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function saveRecentSearch(flightNumber: string): void {
  const cleaned = flightNumber.trim().toUpperCase();
  const recent = [cleaned, ...getRecentSearches().filter((f) => f !== cleaned)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}
