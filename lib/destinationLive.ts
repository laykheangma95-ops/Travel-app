// ─────────────────────────────────────────────────────────────────────────────
// Live destination signals — the two facts that make a place feel *real* the
// instant the globe lands on it: what time it is there, and what the sky is
// doing.
//
// Local time is computed, never fetched: `Intl.DateTimeFormat` with the IANA
// zone is exact, offline, and free. Weather uses Open-Meteo, which needs no API
// key — so it keeps the repo's rule that the app runs with an empty `.env`.
// If the lookup fails for any reason (offline, blocked, rate-limited) callers
// fall back to the seasonal normal stored on the destination profile, clearly
// labelled as a typical value rather than a live one.
// ─────────────────────────────────────────────────────────────────────────────

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night';

export interface LocalClock {
  /** e.g. "21:47" */
  time: string;
  /** e.g. "Tuesday" */
  weekday: string;
  /** Hour 0-23 in the destination. */
  hour: number;
  phase: DayPhase;
  /** Offset from the visitor's own clock, e.g. "+2h" or "same time as you". */
  relative: string;
}

export function phaseForHour(hour: number): DayPhase {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** The emoji that rides the greeting. Kept out of the dictionary so the Khmer
 *  and English strings stay pure text. */
export const PHASE_GLYPH: Record<DayPhase, string> = {
  morning: '☀️',
  afternoon: '🌤',
  evening: '🌙',
  night: '🌙',
};

/** Hour offset between a timezone and the viewer, to the nearest 15 minutes. */
function offsetHours(timezone: string, now: Date): number {
  // Format the same instant in both zones, then diff the wall-clock readings.
  const there = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const here = new Date(now.toLocaleString('en-US'));
  return Math.round(((there.getTime() - here.getTime()) / 3_600_000) * 4) / 4;
}

export function localClock(timezone: string, now: Date = new Date()): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hour12: false,
    }).formatToParts(now);
  } catch {
    // An unknown zone should never reach here, but a broken clock must not
    // take the whole reveal down with it.
    parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hour12: false,
    }).formatToParts(now);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  // 'en-GB' with hour12:false renders midnight as "24" in some engines.
  const rawHour = Number(get('hour'));
  const hour = rawHour === 24 ? 0 : rawHour;
  const time = `${String(hour).padStart(2, '0')}:${get('minute')}`;

  const delta = offsetHours(timezone, now);
  const relative =
    delta === 0
      ? 'same time as you'
      : `${delta > 0 ? '+' : '−'}${formatHourGap(Math.abs(delta))} from you`;

  return { time, weekday: get('weekday'), hour, phase: phaseForHour(hour), relative };
}

function formatHourGap(h: number): string {
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
}

/* ────────────────────────── Weather ────────────────────────── */

export interface LiveWeather {
  tempC: number;
  summary: string;
  /** False when this is the profile's seasonal normal rather than a reading. */
  live: boolean;
}

// WMO weather interpretation codes, collapsed to the handful of states a
// traveller actually plans around.
const WMO: [number[], string][] = [
  [[0], 'Clear sky'],
  [[1, 2], 'Mostly clear'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'],
  [[61, 63, 65, 66, 67], 'Rain'],
  [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Rain showers'],
  [[85, 86], 'Snow showers'],
  [[95, 96, 99], 'Thunderstorms'],
];

function describeCode(code: number): string {
  for (const [codes, label] of WMO) if (codes.includes(code)) return label;
  return 'Clear sky';
}

/**
 * Current conditions from Open-Meteo (keyless, CORS-enabled).
 * Resolves to null on any failure — the caller shows the seasonal normal.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<LiveWeather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}` +
      `&longitude=${lon.toFixed(2)}&current=temperature_2m,weather_code`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json: { current?: { temperature_2m?: number; weather_code?: number } } =
      await res.json();
    const temp = json.current?.temperature_2m;
    const code = json.current?.weather_code;
    if (typeof temp !== 'number' || typeof code !== 'number') return null;
    return { tempC: Math.round(temp), summary: describeCode(code), live: true };
  } catch {
    return null;
  }
}
