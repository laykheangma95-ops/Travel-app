import { describe, expect, it } from 'vitest';
import {
  deriveTravelState,
  emptyReadiness,
  missingSteps,
  readinessPercent,
  type EsimSummary,
  type FlightSummary,
  type TravelerContext,
  type TripSummary,
} from '@/lib/travel/state';

// `now` is injected into the context specifically so these can be pinned. A
// state machine about dates that is tested against the wall clock is a state
// machine that passes until someone runs the suite at midnight.
const NOW = new Date('2026-09-15T09:00:00Z');

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function trip(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: 'trip-1',
    title: 'Singapore',
    destination: 'Singapore',
    destinationSlug: 'singapore',
    flag: '🇸🇬',
    startDate: iso(10),
    endDate: iso(14),
    travelers: 1,
    interests: [],
    readiness: emptyReadiness(),
    coverImageUrl: null,
    isWishlist: false,
    ...overrides,
  };
}

function context(overrides: Partial<TravelerContext> = {}): TravelerContext {
  return {
    signedIn: true,
    displayName: 'Sokha',
    trips: [],
    flights: [],
    esims: [],
    now: NOW,
    ...overrides,
  };
}

const flight = (date: string): FlightSummary => ({
  flightNumber: 'SQ123',
  date,
  departureAirport: 'PNH',
  arrivalAirport: 'SIN',
});

const esim = (overrides: Partial<EsimSummary> = {}): EsimSummary => ({
  orderNumber: 'DMN-2026-00001',
  country: 'Singapore',
  planName: 'Standard 5GB',
  durationDays: 7,
  dataGbDaily: 1,
  status: 'fulfilled',
  fulfilledAt: iso(-1),
  ...overrides,
});

describe('deriveTravelState', () => {
  it('is new_user with nothing on record', () => {
    expect(deriveTravelState(context()).state).toBe('new_user');
  });

  it('is planning when a trip is far out with no flight', () => {
    const snapshot = deriveTravelState(context({ trips: [trip()] }));
    expect(snapshot.state).toBe('planning');
    expect(snapshot.daysUntilStart).toBe(10);
  });

  it('is booked once the flight step is done', () => {
    const snapshot = deriveTravelState(
      context({ trips: [trip({ readiness: { ...emptyReadiness(), flight: true } })] })
    );
    expect(snapshot.state).toBe('booked');
  });

  it('becomes pre_trip inside three days, flight or not', () => {
    expect(deriveTravelState(context({ trips: [trip({ startDate: iso(3), endDate: iso(7) })] })).state).toBe(
      'pre_trip'
    );
    expect(deriveTravelState(context({ trips: [trip({ startDate: iso(1), endDate: iso(5) })] })).state).toBe(
      'pre_trip'
    );
  });

  it('is at_airport on departure day when a flight is that day', () => {
    const snapshot = deriveTravelState(
      context({
        trips: [trip({ startDate: iso(0), endDate: iso(4) })],
        flights: [flight(iso(0))],
      })
    );
    expect(snapshot.state).toBe('at_airport');
  });

  it('is traveling mid-trip, not at_airport', () => {
    const snapshot = deriveTravelState(
      context({
        trips: [trip({ startDate: iso(-2), endDate: iso(2) })],
        flights: [flight(iso(-2))],
      })
    );
    expect(snapshot.state).toBe('traveling');
  });

  it('treats a flight today with no trip as at_airport', () => {
    expect(deriveTravelState(context({ flights: [flight(iso(0))] })).state).toBe('at_airport');
  });

  it('is post_trip for a fortnight after the end, then discovering', () => {
    const justBack = trip({ startDate: iso(-10), endDate: iso(-6) });
    expect(deriveTravelState(context({ trips: [justBack] })).state).toBe('post_trip');
    expect(deriveTravelState(context({ trips: [justBack] })).daysSinceEnd).toBe(6);

    const longBack = trip({ startDate: iso(-40), endDate: iso(-30) });
    expect(deriveTravelState(context({ trips: [longBack] })).state).toBe('discovering');
  });

  it('lets a trip in progress win over a nearer upcoming one', () => {
    const snapshot = deriveTravelState(
      context({
        trips: [
          trip({ id: 'later', startDate: iso(5), endDate: iso(9) }),
          trip({ id: 'now', startDate: iso(-1), endDate: iso(1) }),
        ],
      })
    );
    expect(snapshot.activeTrip?.id).toBe('now');
    expect(snapshot.state).toBe('traveling');
  });

  it('picks the nearest upcoming trip when none is in progress', () => {
    const snapshot = deriveTravelState(
      context({
        trips: [
          trip({ id: 'far', startDate: iso(30), endDate: iso(34) }),
          trip({ id: 'near', startDate: iso(8), endDate: iso(12) }),
        ],
      })
    );
    expect(snapshot.activeTrip?.id).toBe('near');
  });

  it('matches the eSIM to the trip destination', () => {
    const snapshot = deriveTravelState(
      context({
        trips: [trip({ destination: 'Singapore' })],
        esims: [esim({ orderNumber: 'other', country: 'Thailand' }), esim({ country: 'Singapore' })],
      })
    );
    expect(snapshot.activeEsim?.country).toBe('Singapore');
  });

  it('ignores an eSIM that is not paid for', () => {
    const snapshot = deriveTravelState(
      context({ trips: [trip()], esims: [esim({ status: 'pending', fulfilledAt: null })] })
    );
    expect(snapshot.activeEsim).toBeNull();
  });

  it('reports missing steps in a stable order', () => {
    const snapshot = deriveTravelState(
      context({ trips: [trip({ readiness: { ...emptyReadiness(), flight: true, esim: true } })] })
    );
    expect(snapshot.missing).toEqual(['stay', 'places', 'itinerary']);
  });

  it('never claims a state without a trip when only a past flight exists', () => {
    // A flight that has already flown and nothing else: they have history but
    // nothing ahead, which is discovering — not new_user, and not at_airport.
    expect(deriveTravelState(context({ flights: [flight(iso(-20))] })).state).toBe('discovering');
  });
});

describe('readiness helpers', () => {
  it('counts percent from the five steps', () => {
    expect(readinessPercent(emptyReadiness())).toBe(0);
    expect(readinessPercent({ ...emptyReadiness(), flight: true, esim: true })).toBe(40);
    expect(
      readinessPercent({ flight: true, stay: true, esim: true, places: true, itinerary: true })
    ).toBe(100);
  });

  it('lists nothing missing when everything is done', () => {
    expect(
      missingSteps({ flight: true, stay: true, esim: true, places: true, itinerary: true })
    ).toEqual([]);
  });
});
