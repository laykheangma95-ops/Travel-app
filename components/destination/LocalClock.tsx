'use client';

import { useEffect, useState } from 'react';

/**
 * Live local time at the destination, plus the offset from Phnom Penh.
 *
 * Renders a placeholder until mounted: the value depends on the exact instant,
 * so server output would be stale by the time it hydrated. Everything here is
 * computed from the IANA zone via `Intl` — no clock data is stored or guessed.
 */
export function LocalClock({ timezone, className }: { timezone: string; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000 * 30);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return <span className={className}>—</span>;
  }

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  return (
    <span className={className}>
      <time dateTime={now.toISOString()}>{time}</time>
    </span>
  );
}

/** Whole-hour difference from Phnom Penh, e.g. "+2h" — the number a traveller
 *  actually wants when working out when to call home. */
export function timezoneOffsetLabel(timezone: string, now: Date = new Date()): string {
  const at = (tz: string) =>
    new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime();
  const diffHours = Math.round((at(timezone) - at('Asia/Phnom_Penh')) / 3_600_000);
  if (diffHours === 0) return 'Same time as Phnom Penh';
  const sign = diffHours > 0 ? '+' : '−';
  return `${sign}${Math.abs(diffHours)}h from Phnom Penh`;
}

/** Client wrapper so the offset label is computed after mount, like the clock. */
export function TimezoneOffset({ timezone, className }: { timezone: string; className?: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => setLabel(timezoneOffsetLabel(timezone)), [timezone]);
  return <span className={className}>{label ?? ' '}</span>;
}
