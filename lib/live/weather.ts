// Live weather for a destination.
//
// Source: Open-Meteo (https://open-meteo.com) — no API key, which is why it is
// here: it keeps the "runs with an empty .env" convention intact.
//
// ⚠️ LICENSING: Open-Meteo's free tier is for non-commercial use. Before this
// takes production traffic, either subscribe to their commercial plan and set
// OPEN_METEO_BASE_URL to the customer endpoint with OPEN_METEO_API_KEY, or swap
// the provider here. This file is the only place that needs to change.
//
// Like every other external service in this codebase, a missing or failing
// provider degrades to null and the UI simply omits the weather rather than
// guessing at it.

import { log } from '@/lib/logger';

export interface LiveWeather {
  temperatureC: number;
  apparentC: number;
  /** WMO weather interpretation code. */
  code: number;
  isDay: boolean;
  sunrise: string | null;
  sunset: string | null;
  fetchedAt: string;
}

const BASE = process.env.OPEN_METEO_BASE_URL ?? 'https://api.open-meteo.com/v1/forecast';
const KEY = process.env.OPEN_METEO_API_KEY;

/** Cached for 30 minutes — eight destinations means a trivial call volume. */
export const WEATHER_REVALIDATE_SECONDS = 1800;

export async function getWeather(
  lat: number,
  lon: number,
  timezone: string,
): Promise<LiveWeather | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: 'temperature_2m,apparent_temperature,is_day,weather_code',
    daily: 'sunrise,sunset',
    timezone,
    forecast_days: '1',
  });
  if (KEY) params.set('apikey', KEY);

  try {
    const res = await fetch(`${BASE}?${params}`, {
      next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log.warn('weather: provider returned non-ok', { status: res.status });
      return null;
    }
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        is_day?: number;
        weather_code?: number;
      };
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const c = json.current;
    if (!c || typeof c.temperature_2m !== 'number') return null;

    return {
      temperatureC: Math.round(c.temperature_2m),
      apparentC: Math.round(c.apparent_temperature ?? c.temperature_2m),
      code: c.weather_code ?? 0,
      isDay: c.is_day !== 0,
      sunrise: json.daily?.sunrise?.[0] ?? null,
      sunset: json.daily?.sunset?.[0] ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    log.warn('weather: fetch failed', { err: String(err) });
    return null;
  }
}

/**
 * WMO code → a short bilingual description. Grouped, because "light drizzle"
 * versus "moderate drizzle" is not a distinction a traveller needs.
 */
export function describeWeather(code: number): { en: string; km: string } {
  if (code === 0) return { en: 'Clear', km: 'មេឃស្រឡះ' };
  if (code <= 2) return { en: 'Mostly clear', km: 'មេឃស្រឡះភាគច្រើន' };
  if (code === 3) return { en: 'Cloudy', km: 'មានពពក' };
  if (code <= 48) return { en: 'Fog', km: 'អ័ព្ទ' };
  if (code <= 57) return { en: 'Drizzle', km: 'ភ្លៀងតិចៗ' };
  if (code <= 67) return { en: 'Rain', km: 'ភ្លៀង' };
  if (code <= 77) return { en: 'Snow', km: 'ព្រិល' };
  if (code <= 82) return { en: 'Showers', km: 'ភ្លៀងជាដំណាក់' };
  if (code <= 86) return { en: 'Snow showers', km: 'ព្រិលជាដំណាក់' };
  return { en: 'Thunderstorm', km: 'ព្យុះផ្គររន្ទះ' };
}
