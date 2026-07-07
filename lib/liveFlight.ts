// Live aircraft tracking via the open ADS-B network — the same crowdsourced
// receiver network FlightRadar24 is built on. No API key required.
//
// Providers are tried in order until one returns the aircraft:
//   1. api.adsb.lol        (open data, CC0)
//   2. api.airplanes.live  (open data)
//   3. opendata.adsb.fi    (open data)
// Aircraft photo comes from planespotters.net's public API.

export interface LiveFlightData {
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
}

export interface NoLiveData {
  live: false;
  reason: 'not-airborne' | 'unavailable';
}

export type LiveFlightResult = LiveFlightData | NoLiveData;

// IATA airline code → ICAO callsign prefix. ADS-B transponders broadcast the
// ICAO form (e.g. VN841 flies as HVN841).
const IATA_TO_ICAO: Record<string, string> = {
  K6: 'KHV', // Cambodia Angkor Air
  QH: 'BAV', // Bamboo Airways
  VN: 'HVN', // Vietnam Airlines
  VJ: 'VJC', // VietJet Air
  TG: 'THA', // Thai Airways
  PG: 'BKP', // Bangkok Airways
  FD: 'AIQ', // Thai AirAsia
  SQ: 'SIA', // Singapore Airlines
  TR: 'TGW', // Scoot
  MH: 'MAS', // Malaysia Airlines
  AK: 'AXM', // AirAsia
  NH: 'ANA', // All Nippon Airways
  JL: 'JAL', // Japan Airlines
  KE: 'KAL', // Korean Air
  OZ: 'AAR', // Asiana
  CX: 'CPA', // Cathay Pacific
  CI: 'CAL', // China Airlines
  BR: 'EVA', // EVA Air
  MU: 'CES', // China Eastern
  CA: 'CCA', // Air China
  CZ: 'CSN', // China Southern
  EK: 'UAE', // Emirates
  QR: 'QTR', // Qatar Airways
  SU: 'AFL', // Aeroflot
  AF: 'AFR', // Air France
  BA: 'BAW', // British Airways
  LH: 'DLH', // Lufthansa
  UA: 'UAL', // United
  AA: 'AAL', // American
  DL: 'DAL', // Delta
  QF: 'QFA', // Qantas
  GA: 'GIA', // Garuda
  PR: 'PAL', // Philippine Airlines
  '5J': 'CEB', // Cebu Pacific
  '6E': 'IGO', // IndiGo
  AI: 'AIC', // Air India
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

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
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

const PROVIDERS = [
  { name: 'adsb.lol', url: (cs: string) => `https://api.adsb.lol/v2/callsign/${cs}` },
  { name: 'airplanes.live', url: (cs: string) => `https://api.airplanes.live/v2/callsign/${cs}` },
  { name: 'adsb.fi', url: (cs: string) => `https://opendata.adsb.fi/api/v2/callsign/${cs}` },
];

async function fetchAircraftPhoto(hex: string): Promise<{ url: string; photographer: string } | null> {
  const data = await fetchJson<{ photos?: { thumbnail_large?: { src?: string }; photographer?: string }[] }>(
    `https://api.planespotters.net/pub/photos/hex/${hex}`,
    6000
  );
  const photo = data?.photos?.[0];
  if (!photo?.thumbnail_large?.src) return null;
  return { url: photo.thumbnail_large.src, photographer: photo.photographer ?? 'planespotters.net' };
}

export async function fetchLiveFlight(flightNumber: string): Promise<LiveFlightResult> {
  const callsigns = candidateCallsigns(flightNumber);
  let sawProviderResponse = false;

  for (const provider of PROVIDERS) {
    for (const cs of callsigns) {
      const data = await fetchJson<{ ac?: AdsbAircraft[] }>(provider.url(cs));
      if (!data) continue;
      sawProviderResponse = true;

      const aircraft = (data.ac ?? []).find(
        (a) => typeof a.lat === 'number' && typeof a.lon === 'number' && (a.seen ?? 0) < 120
      );
      if (!aircraft) continue;

      const photo = aircraft.hex ? await fetchAircraftPhoto(aircraft.hex) : null;
      const onGround = aircraft.alt_baro === 'ground';

      return {
        live: true,
        callsign: (aircraft.flight ?? cs).trim(),
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
        source: provider.name,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  return { live: false, reason: sawProviderResponse ? 'not-airborne' : 'unavailable' };
}

export function headingToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
