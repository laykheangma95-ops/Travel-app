'use client';

import { useEffect, useState } from 'react';

export interface LivePayload {
  slug: string;
  timezone: string;
  weather: {
    temperatureC: number;
    apparentC: number;
    code: number;
    isDay: boolean;
    description: { en: string; km: string };
  } | null;
  rates: {
    perUsd: number;
    perThousandKhr: number;
    khrPerUsd: number;
    khrIsIndicative: boolean;
    updatedAt: string | null;
  } | null;
}

/** Weather and rates. Null until loaded, and null forever if the providers are
 *  down — the UI omits those panels rather than showing a stale guess. */
export function useLive(slug: string | null): LivePayload | null {
  const [data, setData] = useState<LivePayload | null>(null);

  useEffect(() => {
    if (!slug) {
      setData(null);
      return;
    }
    let cancelled = false;
    setData(null);
    fetch(`/api/destination/${slug}/live`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setData(json as LivePayload);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return data;
}

/**
 * The destination's local time, ticking.
 *
 * No API and no network: an IANA zone from the curated file plus Intl. It is
 * the cheapest live fact on the page and one of the most convincing — the place
 * is visibly running while you read about it.
 */
export function useLocalClock(timezone: string | null): { time: string; weekday: string } | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (!timezone) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  if (!timezone || !now) return null;
  try {
    return {
      time: new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now),
      weekday: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long' }).format(now),
    };
  } catch {
    return null;
  }
}
