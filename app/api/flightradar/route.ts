// ─────────────────────────────────────────────────────────────────────────────
// FlightRadar API — GET /api/flightradar?flight=VN841   (DROP-IN, SELF-CONTAINED)
//
// WHAT THIS IS:
//   Real-time aircraft position for a flight number, powered by the open ADS-B
//   receiver network — the SAME crowdsourced network FlightRadar24 is built on.
//   NO API KEY REQUIRED. Everything lives in THIS ONE FILE, so you can drop it
//   into any Next.js App-Router project on Vercel as `app/api/flightradar/route.ts`
//   and it works immediately.
//
//   Providers are tried in parallel until one returns the aircraft:
//     1. api.adsb.lol         (open data, CC0)
//     2. api.airplanes.live   (open data)
//     3. opendata.adsb.fi     (open data)
//   The aircraft photo comes from planespotters.net's public API.
//
// DEPLOY ON VERCEL:
//   Just deploy — there is nothing to configure. No keys, no env vars.
//
// TRY IT:
//   curl -s "https://YOUR-APP.vercel.app/api/flightradar?flight=VN841"
//
// RESPONSE (airborne):
//   { "live": true, "callsign": "HVN841", "lat": 10.8, "lon": 106.6,
//     "altitudeFt": 35000, "groundSpeedKt": 450, "headingDeg": 270,
//     "onGround": false, "aircraftType": "A321", "registration": "VN-A616",
//     "photoUrl": "...", "source": "adsb.lol", "ageSeconds": 0, ... }
// RESPONSE (not flying): { "live": false, "reason": "not-airborne" | "unavailable" }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ── Types ────────────────────────────────────────────────────────────────────
interface LiveFlightData {
  live: true;
  callsign: string;
  hex: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  headingDeg: number | null;
  verticalRateFpm: number | null;
  squawk: string | null;
  onGround: boolean;
  aircraftType: string | null;
  registration: string | null;
  photoUrl: string | null;
  photographer: string | null;
  source: string;
  fetchedAt: string;
  /** seconds since this fix was received; >0 means served from cache */
  ageSeconds: number;
}
type LiveFlightResult = LiveFlightData | { live: false; reason: 'not-airborne' | 'unavailable' };

// IATA airline code → ICAO callsign prefix. ADS-B transponders broadcast the
// ICAO form (e.g. VN841 flies as HVN841). Add rows for airlines you care about.
const IATA_TO_ICAO: Record<string, string> = {
  K6: 'KHV', QH: 'BAV', VN: 'HVN', VJ: 'VJC', TG: 'THA', PG: 'BKP', FD: 'AIQ',
  SQ: 'SIA', TR: 'TGW', MH: 'MAS', AK: 'AXM', NH: 'ANA', JL: 'JAL', KE: 'KAL',
  OZ: 'AAR', CX: 'CPA', CI: 'CAL', BR: 'EVA', MU: 'CES', CA: 'CCA', CZ: 'CSN',
  EK: 'UAE', QR: 'QTR', SU: 'AFL', AF: 'AFR', BA: 'BAW', LH: 'DLH', UA: 'UAL',
  AA: 'AAL', DL: 'DAL', QF: 'QFA', GA: 'GIA', PR: 'PAL', '5J': 'CEB', '6E': 'IGO',
  AI: 'AIC',
};

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string; // registration
  t?: string; // type code
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  seen?: number;
}

const PROVIDERS = [
  { name: 'adsb.lol', url: (cs: string) => `https://api.adsb.lol/v2/callsign/${cs}` },
  { name: 'airplanes.live', url: (cs: string) => `https://api.airplanes.live/v2/callsign/${cs}` },
  { name: 'adsb.fi', url: (cs: string) => `https://opendata.adsb.fi/api/v2/callsign/${cs}` },
];

// Caches survive between requests while the serverless instance is warm.
const photoCache = new Map<string, { url: string; photographer: string } | null>();
const fixCache = new Map<string, LiveFlightData>();
const FIX_CACHE_TTL_MS = 10 * 60 * 1000;

function candidateCallsigns(flightNumber: string): string[] {
  const cleaned = flightNumber.replace(/\s+/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);
  const candidates = [cleaned];
  if (match) {
    const icao = IATA_TO_ICAO[match[1]];
    if (icao) candidates.unshift(`${icao}${match[2]}`);
  }
  return Array.from(new Set(candidates));
}

async function fetchJson<T>(url: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
      next: { revalidate: 15 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchAircraftPhoto(hex: string): Promise<{ url: string; photographer: string } | null> {
  if (photoCache.has(hex)) return photoCache.get(hex) ?? null;
  const data = await fetchJson<{ photos?: { thumbnail_large?: { src?: string }; photographer?: string }[] }>(
    `https://api.planespotters.net/pub/photos/hex/${hex}`,
    5000
  );
  const photo = data?.photos?.[0];
  const result = photo?.thumbnail_large?.src
    ? { url: photo.thumbnail_large.src, photographer: photo.photographer ?? 'planespotters.net' }
    : null;
  photoCache.set(hex, result);
  return result;
}

interface ProviderHit {
  aircraft: AdsbAircraft;
  callsign: string;
  provider: string;
}

// Query every provider × callsign combination in parallel and take the first
// hit — worst case is one 5s timeout instead of six sequential ones.
async function raceProviders(callsigns: string[]): Promise<{ hit: ProviderHit | null; anyResponse: boolean }> {
  const attempts = PROVIDERS.flatMap((provider) =>
    callsigns.map(async (cs): Promise<ProviderHit | 'responded' | null> => {
      const data = await fetchJson<{ ac?: AdsbAircraft[] }>(provider.url(cs));
      if (!data) return null;
      const aircraft = (data.ac ?? []).find(
        (a) => typeof a.lat === 'number' && typeof a.lon === 'number' && (a.seen ?? 0) < 120
      );
      return aircraft ? { aircraft, callsign: cs, provider: provider.name } : 'responded';
    })
  );

  const settled = await Promise.all(attempts);
  const hit = settled.find((r): r is ProviderHit => r !== null && r !== 'responded') ?? null;
  const anyResponse = settled.some((r) => r !== null);
  return { hit, anyResponse };
}

async function fetchLiveFlight(flightNumber: string): Promise<LiveFlightResult> {
  const callsigns = candidateCallsigns(flightNumber);
  const cacheKey = callsigns[0];

  const { hit, anyResponse } = await raceProviders(callsigns);

  if (hit) {
    const { aircraft, callsign, provider } = hit;
    const photo = aircraft.hex ? await fetchAircraftPhoto(aircraft.hex) : null;
    const onGround = aircraft.alt_baro === 'ground';

    const fix: LiveFlightData = {
      live: true,
      callsign: (aircraft.flight ?? callsign).trim(),
      hex: aircraft.hex ?? '',
      lat: aircraft.lat!,
      lon: aircraft.lon!,
      altitudeFt: typeof aircraft.alt_baro === 'number' ? aircraft.alt_baro : onGround ? 0 : null,
      groundSpeedKt: aircraft.gs ?? null,
      headingDeg: aircraft.track ?? null,
      verticalRateFpm: aircraft.baro_rate ?? null,
      squawk: aircraft.squawk ?? null,
      onGround,
      aircraftType: aircraft.t ?? null,
      registration: aircraft.r ?? null,
      photoUrl: photo?.url ?? null,
      photographer: photo?.photographer ?? null,
      source: provider,
      fetchedAt: new Date().toISOString(),
      ageSeconds: 0,
    };
    fixCache.set(cacheKey, fix);
    return fix;
  }

  // Providers hiccuped or lost the aircraft briefly — serve the last known fix
  // (up to 10 min old) instead of blanking the panel.
  const cached = fixCache.get(cacheKey);
  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (ageMs < FIX_CACHE_TTL_MS) {
      return { ...cached, ageSeconds: Math.round(ageMs / 1000) };
    }
    fixCache.delete(cacheKey);
  }

  return { live: false, reason: anyResponse ? 'not-airborne' : 'unavailable' };
}

// GET /api/flightradar?flight=VN841  (also accepts ?number=VN841)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get('flight') ?? searchParams.get('number');
  if (!number) {
    return NextResponse.json(
      { error: 'Missing flight number. Try ?flight=VN841' },
      { status: 400 }
    );
  }

  const result = await fetchLiveFlight(number);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=15' },
  });
}
