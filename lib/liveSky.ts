// Live "sky snapshot" — every airborne aircraft currently near the hub cities
// the home-page globe features, from the same keyless open ADS-B network as
// lib/liveFlight (adsb.lol → airplanes.live → adsb.fi, no API key required).
//
// The snapshot feeds the globe's cinematic flight layer, so the payload is
// deliberately compact: position, ground track and speed per aircraft — enough
// to draw and dead-reckon a marker, nothing more.

import { fetchJson, type AdsbAircraft } from '@/lib/liveFlight';

export interface SkyPlane {
  hex: string;
  callsign: string;
  lat: number;
  lon: number;
  /** ground track in degrees from north, or null when not broadcast */
  heading: number | null;
  speedKt: number | null;
  altFt: number | null;
}

export interface SkySnapshot {
  planes: SkyPlane[];
  /** total airborne aircraft seen across the queried hubs (pre-cap) */
  count: number;
  fetchedAt: string;
  /** true when providers were unreachable and this is a cached snapshot */
  stale?: boolean;
}

// The globe's beamed hub cities across Asia — one 250 nm circle each keeps
// upstream load at five point queries per refresh while lighting up the whole
// eastern face of the planet.
const SKY_HUBS: [lat: number, lon: number][] = [
  [11.56, 104.92], // Phnom Penh
  [13.75, 100.5], // Bangkok
  [1.35, 103.82], // Singapore
  [22.32, 114.17], // Hong Kong
  [35.68, 139.69], // Tokyo
];

const RADIUS_NM = 250;
const PER_HUB_CAP = 40;
const TOTAL_CAP = 160;

const POINT_PROVIDERS = [
  (lat: number, lon: number) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${RADIUS_NM}`,
  (lat: number, lon: number) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${RADIUS_NM}`,
  (lat: number, lon: number) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${RADIUS_NM}`,
];

// One snapshot is shared by every visitor for its TTL; if all providers go
// quiet we keep serving the last good sky for a while rather than blanking
// the globe. Failures are cached too (with ts re-armed but goodTs kept), so a
// dead upstream costs one probe per TTL window instead of stalling every
// request, and staleness still expires against the last *good* fetch.
let cache: { snap: SkySnapshot; ts: number; goodTs: number } | null = null;
let inFlight: Promise<SkySnapshot> | null = null;
const CACHE_TTL_MS = 30 * 1000;
const STALE_MAX_MS = 10 * 60 * 1000;

// Providers are tried in order per hub (not raced) — the usual outcome is one
// upstream request per hub, with the fallbacks only paying on failure.
async function fetchHub(lat: number, lon: number): Promise<AdsbAircraft[] | null> {
  for (const url of POINT_PROVIDERS) {
    const data = await fetchJson<{ ac?: AdsbAircraft[] }>(url(lat, lon));
    if (data) return data.ac ?? [];
  }
  return null;
}

export async function fetchSkySnapshot(): Promise<SkySnapshot> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.snap;
  if (inFlight) return inFlight;
  inFlight = refreshSnapshot().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function refreshSnapshot(): Promise<SkySnapshot> {
  const results = await Promise.all(SKY_HUBS.map(([lat, lon]) => fetchHub(lat, lon)));

  if (results.every((r) => r === null)) {
    // Every provider unreachable — serve the previous sky while it's credible.
    const goodTs = cache?.goodTs ?? 0;
    const snap: SkySnapshot =
      cache && Date.now() - goodTs < STALE_MAX_MS
        ? { ...cache.snap, stale: true }
        : { planes: [], count: 0, fetchedAt: new Date().toISOString(), stale: true };
    cache = { snap, ts: Date.now(), goodTs };
    return snap;
  }

  const seen = new Set<string>();
  const planes: SkyPlane[] = [];
  let count = 0;
  for (const ac of results) {
    if (!ac) continue;
    let hubTaken = 0;
    for (const a of ac) {
      if (
        typeof a.lat !== 'number' ||
        typeof a.lon !== 'number' ||
        a.alt_baro === 'ground' ||
        (a.seen ?? 0) > 90 ||
        !a.hex ||
        seen.has(a.hex)
      ) {
        continue;
      }
      seen.add(a.hex);
      count++;
      if (hubTaken >= PER_HUB_CAP || planes.length >= TOTAL_CAP) continue;
      hubTaken++;
      planes.push({
        hex: a.hex,
        callsign: (a.flight ?? '').trim() || a.r?.trim() || a.hex.toUpperCase(),
        lat: a.lat,
        lon: a.lon,
        heading: typeof a.track === 'number' ? a.track : null,
        speedKt: typeof a.gs === 'number' ? a.gs : null,
        altFt: typeof a.alt_baro === 'number' ? a.alt_baro : null,
      });
    }
  }

  const snap: SkySnapshot = { planes, count, fetchedAt: new Date().toISOString() };
  cache = { snap, ts: Date.now(), goodTs: Date.now() };
  return snap;
}
