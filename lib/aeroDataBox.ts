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

// ─── Flight number autocomplete ─────────────────────────────────────────────

export interface FlightSuggestion {
  number: string;
  airline: string;
  route?: string;
}

// Popular flights touching Cambodia + regional favorites: gives instant,
// route-annotated suggestions even before the API responds (and offline).
const POPULAR_FLIGHTS: FlightSuggestion[] = [
  { number: 'K6 720', airline: 'Cambodia Angkor Air', route: 'PNH → SGN' },
  { number: 'K6 721', airline: 'Cambodia Angkor Air', route: 'SGN → PNH' },
  { number: 'K6 130', airline: 'Cambodia Angkor Air', route: 'PNH → SAI' },
  { number: 'KR 937', airline: 'Cambodia Airways', route: 'KTI → CAN' },
  { number: 'KR 938', airline: 'Cambodia Airways', route: 'CAN → KTI' },
  { number: 'QH 215', airline: 'Bamboo Airways', route: 'PNH → BKK' },
  { number: 'TG 584', airline: 'Thai Airways', route: 'BKK → PNH' },
  { number: 'TG 585', airline: 'Thai Airways', route: 'PNH → BKK' },
  { number: 'TG 660', airline: 'Thai Airways', route: 'BKK → NRT' },
  { number: 'TG 910', airline: 'Thai Airways', route: 'BKK → LHR' },
  { number: 'PG 933', airline: 'Bangkok Airways', route: 'PNH → BKK' },
  { number: 'PG 934', airline: 'Bangkok Airways', route: 'BKK → PNH' },
  { number: 'FD 606', airline: 'Thai AirAsia', route: 'DMK → PNH' },
  { number: 'FD 607', airline: 'Thai AirAsia', route: 'PNH → DMK' },
  { number: 'VN 841', airline: 'Vietnam Airlines', route: 'PNH → HAN' },
  { number: 'VN 920', airline: 'Vietnam Airlines', route: 'PNH → SGN' },
  { number: 'VN 921', airline: 'Vietnam Airlines', route: 'SGN → PNH' },
  { number: 'SQ 156', airline: 'Singapore Airlines', route: 'SIN → PNH' },
  { number: 'SQ 157', airline: 'Singapore Airlines', route: 'PNH → SIN' },
  { number: 'MH 754', airline: 'Malaysia Airlines', route: 'PNH → KUL' },
  { number: 'MH 755', airline: 'Malaysia Airlines', route: 'KUL → PNH' },
  { number: 'AK 542', airline: 'AirAsia', route: 'KUL → PNH' },
  { number: 'CZ 324', airline: 'China Southern', route: 'PNH → CAN' },
  { number: 'MU 2092', airline: 'China Eastern', route: 'PNH → KMG' },
  { number: 'KE 690', airline: 'Korean Air', route: 'KTI → ICN' },
  { number: 'KE 689', airline: 'Korean Air', route: 'ICN → KTI' },
];

const AIRLINE_NAMES: Record<string, string> = {
  K6: 'Cambodia Angkor Air',
  KR: 'Cambodia Airways',
  QH: 'Bamboo Airways',
  TG: 'Thai Airways',
  PG: 'Bangkok Airways',
  FD: 'Thai AirAsia',
  VN: 'Vietnam Airlines',
  VJ: 'VietJet Air',
  SQ: 'Singapore Airlines',
  TR: 'Scoot',
  MH: 'Malaysia Airlines',
  AK: 'AirAsia',
  NH: 'All Nippon Airways',
  JL: 'Japan Airlines',
  KE: 'Korean Air',
  OZ: 'Asiana Airlines',
  CX: 'Cathay Pacific',
  CI: 'China Airlines',
  BR: 'EVA Air',
  MU: 'China Eastern',
  CA: 'Air China',
  CZ: 'China Southern',
  EK: 'Emirates',
  QR: 'Qatar Airways',
};

function normalizeNumber(n: string): string {
  return n.replace(/\s+/g, '').toUpperCase();
}

export async function suggestFlights(term: string): Promise<FlightSuggestion[]> {
  const q = normalizeNumber(term);
  if (q.length < 2) return [];

  const local = POPULAR_FLIGHTS.filter((f) => normalizeNumber(f.number).startsWith(q));

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return local.slice(0, 8);

  try {
    const res = await fetch(`https://${HOST}/flights/search/term?search=${encodeURIComponent(q)}&limit=10`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return local.slice(0, 8);

    const data = (await res.json()) as { items?: Array<{ number?: string; airlineName?: string }> };
    const seen = new Set(local.map((f) => normalizeNumber(f.number)));
    const remote: FlightSuggestion[] = (data.items ?? [])
      .filter((item): item is { number: string; airlineName?: string } => Boolean(item.number))
      .filter((item) => !seen.has(normalizeNumber(item.number)))
      .map((item) => ({
        number: item.number,
        airline:
          item.airlineName ??
          AIRLINE_NAMES[normalizeNumber(item.number).slice(0, 2)] ??
          'Airline',
      }));

    return [...local, ...remote].slice(0, 8);
  } catch {
    return local.slice(0, 8);
  }
}

// ─── Airport departure board (FIDS) ─────────────────────────────────────────

export type BoardStage =
  | 'scheduled'
  | 'check-in'
  | 'boarding'
  | 'final-call'
  | 'gate-closed'
  | 'departed'
  | 'delayed'
  | 'cancelled';

export interface BoardFlight {
  number: string;
  airline: string;
  destination: string;
  destinationIata: string;
  scheduledTime: string; // HH:mm local
  revisedTime?: string;
  stage: BoardStage;
  gate?: string;
  terminal?: string;
  checkIn?: string;
  demo?: boolean;
}

function mapFidsStatus(raw: string, scheduledMs: number, now: number): BoardStage {
  const s = raw.toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('departed') || s.includes('enroute') || s.includes('airborne')) return 'departed';
  if (s.includes('gateclos') || s.includes('gate clos')) return 'gate-closed';
  if (s.includes('boarding')) return 'boarding';
  if (s.includes('checkin') || s.includes('check-in')) return 'check-in';
  if (s.includes('delay')) return 'delayed';
  // No explicit stage from the airport — infer from time.
  const minutesToGo = (scheduledMs - now) / 60000;
  if (minutesToGo < -10) return 'departed';
  if (minutesToGo < 20) return 'final-call';
  if (minutesToGo < 45) return 'boarding';
  if (minutesToGo < 180) return 'check-in';
  return 'scheduled';
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Demo board so the page works before an API key is configured.
export function getMockAirportBoard(iata: string): BoardFlight[] {
  const now = Date.now();
  const rows: Array<[string, string, string, string, number, BoardStage, string, string]> = [
    ['K6 720', 'Cambodia Angkor Air', 'Ho Chi Minh City', 'SGN', -25, 'departed', 'A2', 'C01-C03'],
    ['KR 937', 'Cambodia Airways', 'Guangzhou', 'CAN', 12, 'final-call', 'A35', 'B06-B09'],
    ['QH 215', 'Bamboo Airways', 'Bangkok', 'BKK', 34, 'boarding', 'B3', 'C04-C08'],
    ['SQ 157', 'Singapore Airlines', 'Singapore', 'SIN', 75, 'check-in', 'B7', 'D01-D05'],
    ['VN 841', 'Vietnam Airlines', 'Hanoi', 'HAN', 95, 'check-in', 'A6', 'C09-C12'],
    ['FD 607', 'Thai AirAsia', 'Bangkok Don Mueang', 'DMK', 140, 'check-in', 'B1', 'B01-B04'],
    ['CZ 324', 'China Southern', 'Guangzhou', 'CAN', 205, 'scheduled', '—', 'opens 17:40'],
    ['PG 934', 'Bangkok Airways', 'Bangkok', 'BKK', 260, 'scheduled', '—', 'opens 18:35'],
  ];
  return rows.map(([number, airline, destination, destinationIata, offsetMin, stage, gate, checkIn]) => ({
    number,
    airline,
    destination,
    destinationIata,
    scheduledTime: hhmm(new Date(now + offsetMin * 60000)),
    stage,
    gate: gate === '—' ? undefined : gate,
    terminal: iata === 'KTI' ? '1' : undefined,
    checkIn,
    demo: true,
  }));
}

interface FidsLeg {
  number: string;
  status: string;
  airline?: { name?: string };
  movement: {
    airport?: { iata?: string; name?: string; municipalityName?: string };
    scheduledTime?: { local?: string };
    revisedTime?: { local?: string };
    gate?: string;
    terminal?: string;
    checkInDesk?: string;
  };
}

export async function fetchAirportBoard(iata: string): Promise<BoardFlight[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return getMockAirportBoard(iata);

  try {
  // FIDS window: from 1h ago to 11h ahead (12h max per request).
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hhmm(d)}`;
  const from = new Date(Date.now() - 60 * 60000);
  const to = new Date(Date.now() + 11 * 60 * 60000);

  const res = await fetch(
    `https://${HOST}/flights/airports/iata/${iata.toUpperCase()}/${fmt(from)}/${fmt(to)}?direction=Departure&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false`,
    {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
      next: { revalidate: 60 },
    }
  );
  if (!res.ok) return getMockAirportBoard(iata);

  const data = (await res.json()) as { departures?: FidsLeg[] };
  const departures = data.departures ?? [];
  if (departures.length === 0) return getMockAirportBoard(iata);

  const now = Date.now();
  return departures
    .map((leg): BoardFlight | null => {
      const scheduled = leg.movement.scheduledTime?.local;
      if (!scheduled) return null;
      const scheduledMs = new Date(scheduled).getTime();
      const revised = leg.movement.revisedTime?.local;
      return {
        number: leg.number,
        airline: leg.airline?.name ?? '',
        destination: leg.movement.airport?.municipalityName ?? leg.movement.airport?.name ?? '',
        destinationIata: leg.movement.airport?.iata ?? '',
        scheduledTime: hhmm(new Date(scheduled)),
        revisedTime: revised ? hhmm(new Date(revised)) : undefined,
        stage: mapFidsStatus(leg.status ?? '', scheduledMs, now),
        gate: leg.movement.gate,
        terminal: leg.movement.terminal,
        checkIn: leg.movement.checkInDesk,
      };
    })
    .filter((f): f is BoardFlight => f !== null)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  } catch (error) {
    console.error('[fids] AeroDataBox board request failed, serving mock:', error instanceof Error ? error.message : error);
    return getMockAirportBoard(iata);
  }
}

export async function fetchFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return getMockFlightStatus(flightNumber, date);

  try {
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
  } catch (error) {
    // A configured key can still fail — expired subscription, quota, rate
    // limit, timeout, or a network hiccup on the serverless host. Fall back to
    // stable mock data so the tracker keeps working instead of 404-ing.
    console.error('[flights] AeroDataBox request failed, serving mock:', error instanceof Error ? error.message : error);
    return getMockFlightStatus(flightNumber, date);
  }
}
