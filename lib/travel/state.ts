// ─────────────────────────────────────────────────────────────────────────────
// The travel state machine.
//
// Home is not a page in Domner, it is a *moment*. The same traveler needs a
// different screen the week before a trip, the morning of the flight, and the
// hour they land — so the homepage asks this module what moment it is and
// renders for that, instead of showing every feature at once.
//
// Pure and dependency-free: importable from a client component, a server
// component, or a test. The data it reasons over is assembled by
// lib/travel/context.ts (server-only).
// ─────────────────────────────────────────────────────────────────────────────

import type { TripInterest } from './trips';

export const TRAVEL_STATES = [
  'new_user',
  'discovering',
  'planning',
  'booked',
  'pre_trip',
  'at_airport',
  'traveling',
  'post_trip',
] as const;

export type TravelState = (typeof TRAVEL_STATES)[number];

/** The five things a trip needs before departure. Drives TripProgress. */
export const READINESS_STEPS = ['flight', 'stay', 'esim', 'places', 'itinerary'] as const;
export type ReadinessStep = (typeof READINESS_STEPS)[number];

export type Readiness = Record<ReadinessStep, boolean>;

export interface TripSummary {
  id: string;
  title: string;
  destination: string;
  /** destinations[].slug when we recognise the place, so cards can link to it. */
  destinationSlug: string | null;
  flag: string | null;
  /** ISO date (YYYY-MM-DD). Null when the traveler has not committed to dates. */
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  /** What the traveler is into. Drives itinerary generation later; edited on TripForm. */
  interests: TripInterest[];
  readiness: Readiness;
  coverImageUrl: string | null;
  /**
   * True when the trip was auto-created by saving a place rather than filled
   * out on the New trip form (trip_plans.is_wishlist, migration 011). Set by
   * the server only — never edited by the traveler.
   */
  isWishlist: boolean;
}

export interface FlightSummary {
  flightNumber: string;
  /** ISO date of departure. */
  date: string;
  departureAirport: string | null;
  arrivalAirport: string | null;
}

export interface EsimSummary {
  orderNumber: string;
  country: string;
  planName: string;
  durationDays: number;
  dataGbDaily: number;
  status: string;
  /** Set once fulfilment completed — the moment the eSIM became usable. */
  fulfilledAt: string | null;
}

export interface TravelerContext {
  signedIn: boolean;
  displayName: string | null;
  trips: TripSummary[];
  flights: FlightSummary[];
  esims: EsimSummary[];
  /** Injected rather than read from the clock so this stays testable. */
  now: Date;
  /**
   * True when the trips table could not be read at all, as opposed to the
   * traveler genuinely having none. Callers that would otherwise say "no trips"
   * or "that trip does not exist" must say "we could not load your trips"
   * instead — the two are indistinguishable in the data and very different to
   * the person reading them.
   */
  tripsUnavailable?: boolean;
}

export interface TravelSnapshot {
  state: TravelState;
  /** The trip Home should be about. Null in new_user / discovering. */
  activeTrip: TripSummary | null;
  /** The flight Home should be about — the next one that has not departed. */
  activeFlight: FlightSummary | null;
  /** The eSIM covering the active trip, when there is one. */
  activeEsim: EsimSummary | null;
  /** Whole days until the active trip starts. Negative once it has begun. */
  daysUntilStart: number | null;
  /** Whole days since the active trip ended. Null while it has not. */
  daysSinceEnd: number | null;
  /** Steps still missing on the active trip, in READINESS_STEPS order. */
  missing: ReadinessStep[];
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole days from `now` to an ISO date. Positive means the date is ahead. */
function daysBetween(now: Date, isoDate: string): number | null {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return Math.round((parsed - startOfDay(now)) / DAY_MS);
}

export function emptyReadiness(): Readiness {
  return { flight: false, stay: false, esim: false, places: false, itinerary: false };
}

export function missingSteps(readiness: Readiness): ReadinessStep[] {
  return READINESS_STEPS.filter((step) => !readiness[step]);
}

export function readinessPercent(readiness: Readiness): number {
  const done = READINESS_STEPS.filter((step) => readiness[step]).length;
  return Math.round((done / READINESS_STEPS.length) * 100);
}

/**
 * Pick the trip Home should be about.
 *
 * A trip in progress always wins — you cannot be planning next month while
 * standing in Singapore. After that, the nearest upcoming trip, then the most
 * recently finished one, then anything undated (a wishlist entry).
 */
function selectActiveTrip(trips: TripSummary[], now: Date): TripSummary | null {
  if (trips.length === 0) return null;

  const dated = trips.filter((trip) => trip.startDate !== null);

  const inProgress = dated
    .filter((trip) => {
      const toStart = daysBetween(now, trip.startDate!);
      const toEnd = trip.endDate ? daysBetween(now, trip.endDate) : toStart;
      return toStart !== null && toEnd !== null && toStart <= 0 && toEnd >= 0;
    })
    .sort((a, b) => (a.startDate! < b.startDate! ? 1 : -1));
  if (inProgress.length > 0) return inProgress[0];

  const upcoming = dated
    .filter((trip) => (daysBetween(now, trip.startDate!) ?? -1) > 0)
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
  if (upcoming.length > 0) return upcoming[0];

  const finished = dated
    .filter((trip) => {
      const end = trip.endDate ?? trip.startDate!;
      return (daysBetween(now, end) ?? 1) < 0;
    })
    .sort((a, b) => ((a.endDate ?? a.startDate!) < (b.endDate ?? b.startDate!) ? 1 : -1));
  if (finished.length > 0) return finished[0];

  return trips[0];
}

/** The next flight that has not already flown, by date. */
function selectActiveFlight(flights: FlightSummary[], now: Date): FlightSummary | null {
  const future = flights
    .filter((flight) => (daysBetween(now, flight.date) ?? -1) >= 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return future[0] ?? flights[0] ?? null;
}

/**
 * Which eSIM belongs to the active trip.
 *
 * Matched on destination name because that is the only join the live schema
 * offers — esim_orders.country is a display string, and trip_plans.destination
 * is too. A country-code column on both would make this exact; until then a
 * case-insensitive match is honest and wrong only for a trip whose destination
 * is written differently from the plan that was bought.
 */
function selectActiveEsim(esims: EsimSummary[], trip: TripSummary | null): EsimSummary | null {
  const usable = esims.filter((esim) => esim.status === 'fulfilled' || esim.status === 'paid');
  if (usable.length === 0) return null;
  if (!trip) return usable[0];

  const destination = trip.destination.trim().toLowerCase();
  const matched = usable.find(
    (esim) =>
      esim.country.trim().toLowerCase() === destination ||
      destination.includes(esim.country.trim().toLowerCase())
  );
  return matched ?? usable[0];
}

/**
 * The one function Home calls.
 *
 * The ordering of the checks below *is* the product decision: what is happening
 * now outranks what is coming, which outranks what has been. Read it top to
 * bottom as "the most present thing wins".
 */
export function deriveTravelState(context: TravelerContext): TravelSnapshot {
  const { trips, flights, esims, now } = context;

  const activeTrip = selectActiveTrip(trips, now);
  const activeFlight = selectActiveFlight(flights, now);
  const activeEsim = selectActiveEsim(esims, activeTrip);

  const daysUntilStart = activeTrip?.startDate ? daysBetween(now, activeTrip.startDate) : null;
  const endDate = activeTrip?.endDate ?? activeTrip?.startDate ?? null;
  const daysToEnd = endDate ? daysBetween(now, endDate) : null;
  const daysSinceEnd = daysToEnd !== null && daysToEnd < 0 ? Math.abs(daysToEnd) : null;
  const missing = activeTrip ? missingSteps(activeTrip.readiness) : [];

  const snapshot = (state: TravelState): TravelSnapshot => ({
    state,
    activeTrip,
    activeFlight,
    activeEsim,
    daysUntilStart,
    daysSinceEnd,
    missing,
  });

  // Nothing at all: no trip, no flight, no purchase. Show them the world.
  const hasAnything = trips.length > 0 || flights.length > 0 || esims.length > 0;
  if (!hasAnything) return snapshot('new_user');

  // Mid-trip. Home becomes a travel assistant.
  if (daysUntilStart !== null && daysToEnd !== null && daysUntilStart <= 0 && daysToEnd >= 0) {
    // Departure day with a flight on it — the airport hours, where the only
    // things that matter are the gate and the time.
    if (daysUntilStart === 0 && activeFlight && daysBetween(now, activeFlight.date) === 0) {
      return snapshot('at_airport');
    }
    return snapshot('traveling');
  }

  // A flight today with no trip record around it still means the airport.
  if (activeFlight && daysBetween(now, activeFlight.date) === 0 && daysUntilStart === null) {
    return snapshot('at_airport');
  }

  // The trip is ahead of us.
  if (daysUntilStart !== null && daysUntilStart > 0) {
    // Inside three days it stops being planning and becomes preparation.
    if (daysUntilStart <= 3) return snapshot('pre_trip');
    // A flight is the commitment that turns a plan into a trip.
    if (activeTrip?.readiness.flight) return snapshot('booked');
    return snapshot('planning');
  }

  // It happened. A fortnight is long enough to still want the memories screen
  // in front of you, and short enough that it is not stale.
  if (daysSinceEnd !== null && daysSinceEnd <= 14) return snapshot('post_trip');

  // Signed in, has history, nothing on the horizon.
  return snapshot('discovering');
}

/** Copy for the Home hero, per state. `km` is a mirror of `en`, never a subset. */
export const STATE_GREETING: Record<TravelState, { en: string; km: string }> = {
  new_user: { en: 'Where are you going next?', km: 'តើអ្នកនឹងទៅណាបន្ទាប់?' },
  discovering: { en: 'Where to next?', km: 'ទៅណាបន្ទាប់?' },
  planning: { en: 'Your trip is taking shape', km: 'ដំណើររបស់អ្នកកំពុងរៀបចំ' },
  booked: { en: "You're going", km: 'អ្នកនឹងទៅហើយ' },
  pre_trip: { en: 'Almost time', km: 'ជិតដល់ពេលហើយ' },
  at_airport: { en: 'Safe travels today', km: 'ដំណើរសុវត្ថិភាព' },
  traveling: { en: 'Good morning', km: 'អរុណសួស្តី' },
  post_trip: { en: 'Welcome home', km: 'សូមស្វាគមន៍ការត្រឡប់មកវិញ' },
};
