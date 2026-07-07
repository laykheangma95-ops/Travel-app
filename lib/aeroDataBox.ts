import type { FlightStatus, FlightStatusKind } from '@/types';

// AeroDataBox via RapidAPI. When RAPIDAPI_KEY is missing we serve realistic
// mock data so the flight tracker works end-to-end in development/demo mode.

const HOST = process.env.AEROBOX_HOST ?? 'aerodatabox.p.rapidapi.com';

interface AirportMeta {
  code: string;
  name: string;
  city: string;
  timezone: string;
}

const AIRPORTS: Record<string, AirportMeta> = {
  PNH: { code: 'PNH', name: 'Phnom Penh International', city: 'Phnom Penh', timezone: 'Asia/Phnom_Penh' },
  SAI: { code: 'SAI', name: 'Siem Reap Angkor International', city: 'Siem Reap', timezone: 'Asia/Phnom_Penh' },
  BKK: { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', timezone: 'Asia/Bangkok' },
  DMK: { code: 'DMK', name: 'Don Mueang', city: 'Bangkok', timezone: 'Asia/Bangkok' },
  SGN: { code: 'SGN', name: 'Tan Son Nhat', city: 'Ho Chi Minh City', timezone: 'Asia/Ho_Chi_Minh' },
  HAN: { code: 'HAN', name: 'Noi Bai', city: 'Hanoi', timezone: 'Asia/Ho_Chi_Minh' },
  SIN: { code: 'SIN', name: 'Changi', city: 'Singapore', timezone: 'Asia/Singapore' },
  NRT: { code: 'NRT', name: 'Narita', city: 'Tokyo', timezone: 'Asia/Tokyo' },
  ICN: { code: 'ICN', name: 'Incheon', city: 'Seoul', timezone: 'Asia/Seoul' },
  KUL: { code: 'KUL', name: 'Kuala Lumpur International', city: 'Kuala Lumpur', timezone: 'Asia/Kuala_Lumpur' },
};

const AIRLINES: Record<string, string> = {
  QH: 'Cambodia Angkor Air',
  K6: 'Cambodia Angkor Air',
  PG: 'Bangkok Airways',
  TG: 'Thai Airways',
  VN: 'Vietnam Airlines',
  SQ: 'Singapore Airlines',
  MH: 'Malaysia Airlines',
  FD: 'Thai AirAsia',
  VJ: 'VietJet Air',
  NH: 'All Nippon Airways',
};

const MOCK_ROUTES: Record<string, { from: string; to: string; depHour: number; arrHour: number; aircraft: string; registration: string }> = {
  QH215: { from: 'PNH', to: 'BKK', depHour: 14.5, arrHour: 15.75, aircraft: 'Airbus A320', registration: 'XU-356' },
  K6720: { from: 'PNH', to: 'SGN', depHour: 9, arrHour: 10, aircraft: 'ATR 72-500', registration: 'XU-234' },
  PG934: { from: 'BKK', to: 'PNH', depHour: 12, arrHour: 13.25, aircraft: 'Airbus A319', registration: 'HS-PPA' },
  VN841: { from: 'PNH', to: 'HAN', depHour: 17.5, arrHour: 19.25, aircraft: 'Airbus A321', registration: 'VN-A611' },
  SQ157: { from: 'PNH', to: 'SIN', depHour: 11, arrHour: 14, aircraft: 'Boeing 737-800', registration: '9V-MGA' },
};

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

function timeFromHour(date: string, hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${date}T${pad(h)}:${pad(m)}:00`;
}

// Deterministic pseudo-random from flight number so demo data is stable
// within a session but varies between flights.
function seedFrom(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h;
}

export function getMockFlightStatus(flightNumber: string, date: string): FlightStatus {
  const key = flightNumber.replace(/\s+/g, '').toUpperCase();
  const route = MOCK_ROUTES[key] ?? MOCK_ROUTES.QH215;
  const seed = seedFrom(key + date);
  const from = AIRPORTS[route.from];
  const to = AIRPORTS[route.to];
  const airlineCode = key.slice(0, 2);

  const statuses: FlightStatusKind[] = ['on-time', 'on-time', 'delayed', 'boarding', 'active', 'landed'];
  const status = statuses[seed % statuses.length];
  const delayMinutes = status === 'delayed' ? 20 + (seed % 40) : undefined;
  const progress = status === 'active' ? 40 + (seed % 55) : status === 'landed' ? 100 : 0;

  return {
    flightNumber: `${airlineCode} ${key.slice(2)}`,
    airline: AIRLINES[airlineCode] ?? 'Cambodia Angkor Air',
    status,
    departure: {
      airport: from.code,
      airportName: from.name,
      city: from.city,
      scheduledTime: timeFromHour(date, route.depHour),
      actualTime: delayMinutes ? timeFromHour(date, route.depHour + delayMinutes / 60) : undefined,
      gate: `B${(seed % 8) + 1}`,
      terminal: '1',
      checkInCounter: 'Counter 4-8',
      timezone: from.timezone,
    },
    arrival: {
      airport: to.code,
      airportName: to.name,
      city: to.city,
      scheduledTime: timeFromHour(date, route.arrHour),
      estimatedTime: delayMinutes ? timeFromHour(date, route.arrHour + delayMinutes / 60) : undefined,
      gate: `C${(seed % 14) + 1}`,
      terminal: '1',
      baggageBelt: String((seed % 12) + 1),
      timezone: to.timezone,
    },
    aircraft: route.aircraft,
    registration: route.registration,
    delayMinutes,
    progress,
    trackerCount: (seed % 5) + 1,
    demo: true,
  };
}

interface AeroDataBoxLeg {
  number: string;
  status: string;
  airline?: { name?: string };
  departure: {
    airport?: { iata?: string; name?: string; municipalityName?: string; timeZone?: string };
    scheduledTime?: { local?: string };
    revisedTime?: { local?: string };
    gate?: string;
    terminal?: string;
    checkInDesk?: string;
  };
  arrival: {
    airport?: { iata?: string; name?: string; municipalityName?: string; timeZone?: string };
    scheduledTime?: { local?: string };
    predictedTime?: { local?: string };
    gate?: string;
    terminal?: string;
    baggageBelt?: string;
  };
  aircraft?: { model?: string; reg?: string };
}

function mapStatus(raw: string): FlightStatusKind {
  const s = raw.toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('divert')) return 'diverted';
  if (s.includes('arrived') || s.includes('landed')) return 'landed';
  if (s.includes('boarding')) return 'boarding';
  if (s.includes('enroute') || s.includes('departed') || s.includes('airborne')) return 'active';
  if (s.includes('delay')) return 'delayed';
  if (s.includes('expected') || s.includes('checkin') || s.includes('scheduled')) return 'on-time';
  return 'scheduled';
}

export async function fetchFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return getMockFlightStatus(flightNumber, date);

  const cleaned = flightNumber.replace(/\s+/g, '').toUpperCase();
  const res = await fetch(`https://${HOST}/flights/number/${cleaned}/${date}?withAircraftImage=false&withLocation=false`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
    next: { revalidate: 90 },
  });
  if (!res.ok) return getMockFlightStatus(flightNumber, date);

  const legs = (await res.json()) as AeroDataBoxLeg[];
  const leg = Array.isArray(legs) ? legs[0] : undefined;
  if (!leg) return getMockFlightStatus(flightNumber, date);

  const scheduledDep = leg.departure.scheduledTime?.local ?? `${date}T00:00:00`;
  const scheduledArr = leg.arrival.scheduledTime?.local ?? `${date}T00:00:00`;
  const revisedDep = leg.departure.revisedTime?.local;
  const delayMinutes = revisedDep
    ? Math.max(0, Math.round((new Date(revisedDep).getTime() - new Date(scheduledDep).getTime()) / 60000))
    : undefined;

  const now = Date.now();
  const depMs = new Date(revisedDep ?? scheduledDep).getTime();
  const arrMs = new Date(leg.arrival.predictedTime?.local ?? scheduledArr).getTime();
  const progress =
    now <= depMs ? 0 : now >= arrMs ? 100 : Math.round(((now - depMs) / (arrMs - depMs)) * 100);

  return {
    flightNumber: leg.number,
    airline: leg.airline?.name ?? 'Unknown airline',
    status: delayMinutes && delayMinutes > 15 && mapStatus(leg.status) === 'on-time' ? 'delayed' : mapStatus(leg.status),
    departure: {
      airport: leg.departure.airport?.iata ?? '???',
      airportName: leg.departure.airport?.name ?? 'Unknown',
      city: leg.departure.airport?.municipalityName ?? '',
      scheduledTime: scheduledDep,
      actualTime: revisedDep,
      gate: leg.departure.gate,
      terminal: leg.departure.terminal,
      checkInCounter: leg.departure.checkInDesk,
      timezone: leg.departure.airport?.timeZone ?? 'UTC',
    },
    arrival: {
      airport: leg.arrival.airport?.iata ?? '???',
      airportName: leg.arrival.airport?.name ?? 'Unknown',
      city: leg.arrival.airport?.municipalityName ?? '',
      scheduledTime: scheduledArr,
      estimatedTime: leg.arrival.predictedTime?.local,
      gate: leg.arrival.gate,
      terminal: leg.arrival.terminal,
      baggageBelt: leg.arrival.baggageBelt,
      timezone: leg.arrival.airport?.timeZone ?? 'UTC',
    },
    aircraft: leg.aircraft?.model,
    registration: leg.aircraft?.reg,
    delayMinutes,
    progress,
  };
}
