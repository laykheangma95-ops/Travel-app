// ─────────────────────────────────────────────────────────────────────────────
// Assembles the traveler's context from the live schema.
//
// Reads through the CALLER'S session client, not the service role: every query
// here is scoped by RLS to the signed-in traveler's own rows. That is
// deliberate — this data is only ever rendered back to the person it belongs
// to, so there is no reason to reach for a key that can see everyone.
//
// SERVER ONLY.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFromRequest, getUser } from '@/lib/serverAuth';
import { destinations } from '@/data/destinations';
import { log } from '@/lib/logger';
import {
  emptyReadiness,
  type EsimSummary,
  type FlightSummary,
  type Readiness,
  type TravelerContext,
  type TripSummary,
} from './state';
import { TRIP_INTERESTS, type TripInterest } from './trips';

interface TripRow {
  id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
  interests: string[] | null;
  cover_image_url: string | null;
  is_wishlist: boolean | null;
}

interface FlightRow {
  flight_number: string;
  flight_date: string;
  departure_airport: string | null;
  arrival_airport: string | null;
}

interface OrderRow {
  order_number: string;
  country: string;
  plan_name: string;
  duration_days: number;
  data_gb_daily: number;
  status: string;
  fulfilled_at: string | null;
}

/** One `itinerary_places` row, with the day it belongs to carried alongside. */
interface ItineraryPlaceRow {
  category: string;
  itinerary_day_id: string;
}

/** One `itinerary_days` row. day_index 0 is the unscheduled Ideas list. */
interface ItineraryDayRow {
  id: string;
  trip_id: string;
  day_index: number;
}

/** What readiness needs to know about one trip's itinerary, already counted. */
interface ItinerarySignal {
  /** Places saved anywhere on this trip, Ideas included. */
  savedPlaces: number;
  /** Places sitting on a numbered day — i.e. actually scheduled. */
  scheduledPlaces: number;
  /** Somewhere to sleep has been recorded. */
  hasStay: boolean;
}

const NO_ITINERARY: ItinerarySignal = { savedPlaces: 0, scheduledPlaces: 0, hasStay: false };

/**
 * Fold the day and place rows into one signal per trip.
 *
 * Done once for the whole context rather than per trip, so twenty trips cost
 * the same two queries as one.
 */
function itinerarySignals(
  days: ItineraryDayRow[],
  places: ItineraryPlaceRow[]
): Map<string, ItinerarySignal> {
  const dayToTrip = new Map(days.map((day) => [day.id, day.trip_id]));
  const scheduledDays = new Set(days.filter((day) => day.day_index > 0).map((day) => day.id));
  const signals = new Map<string, ItinerarySignal>();

  for (const place of places) {
    const tripId = dayToTrip.get(place.itinerary_day_id);
    if (!tripId) continue;

    const current = signals.get(tripId) ?? { savedPlaces: 0, scheduledPlaces: 0, hasStay: false };
    current.savedPlaces += 1;
    if (scheduledDays.has(place.itinerary_day_id)) current.scheduledPlaces += 1;
    if (place.category === 'stay') current.hasStay = true;
    signals.set(tripId, current);
  }

  return signals;
}

/** Match a free-text destination to a catalogue entry, for the flag and the link. */
function matchDestination(destination: string): { slug: string; flag: string } | null {
  const needle = destination.trim().toLowerCase();
  if (!needle) return null;
  const found = destinations.find(
    (candidate) =>
      candidate.name.toLowerCase() === needle ||
      needle.includes(candidate.name.toLowerCase()) ||
      candidate.slug === needle
  );
  return found ? { slug: found.slug, flag: found.flag } : null;
}

/**
 * Keep only the interests the app still recognises.
 *
 * `interests` is a free-form TEXT[], so a row written before a tag was renamed
 * (or by hand in the dashboard) can hold something the form has no chip for.
 * Dropping the unknown ones keeps the edit screen honest rather than silently
 * discarding them on the next save.
 */
function knownInterests(values: string[] | null): TripInterest[] {
  if (!values) return [];
  const known = new Set<string>(TRIP_INTERESTS);
  return values.filter((value): value is TripInterest => known.has(value));
}

/** Does an ISO date fall inside the trip's window (inclusive)? */
function withinTrip(trip: TripRow, isoDate: string): boolean {
  if (!trip.start_date) return false;
  const end = trip.end_date ?? trip.start_date;
  return isoDate >= trip.start_date && isoDate <= end;
}

/**
 * Work out how ready a trip is.
 *
 * WHERE THIS USED TO READ FROM, AND WHY IT MOVED:
 *   `stay`, `places` and `itinerary` were all derived from
 *   `trip_plans.generated_itinerary`. Nothing in this repository has ever
 *   written that column — it appears only in reads — and the fallback path for
 *   `places` read `trip_checklist_items`, which nothing writes either. All
 *   three were therefore permanently false for every trip that has ever
 *   existed, so readiness could never exceed 40% and "Everything is in place"
 *   was unreachable code.
 *
 *   The itinerary builder writes `itinerary_days` and `itinerary_places`
 *   (migration 007). Those are the tables that actually know whether a trip has
 *   a plan, so those are the tables this reads.
 *
 * The three still mean distinct things:
 *   places    — anything saved at all, including the unscheduled Ideas list
 *   itinerary — at least one numbered day with something in it
 *   stay      — a place recorded with category 'stay' (migration 008)
 *
 * `stay` staying false is still the honest answer for a trip where nobody has
 * noted where they are sleeping. What changed is that it is now *possible* to
 * answer it.
 */
function deriveReadiness(
  trip: TripRow,
  flights: FlightRow[],
  orders: OrderRow[],
  itinerary: ItinerarySignal
): Readiness {
  const readiness = emptyReadiness();

  readiness.flight = flights.some((flight) => withinTrip(trip, flight.flight_date));

  const destination = trip.destination.trim().toLowerCase();
  readiness.esim = orders.some(
    (order) =>
      (order.status === 'paid' || order.status === 'fulfilled') &&
      (order.country.trim().toLowerCase() === destination ||
        destination.includes(order.country.trim().toLowerCase()))
  );

  readiness.places = itinerary.savedPlaces > 0;
  readiness.itinerary = itinerary.scheduledPlaces > 0;
  readiness.stay = itinerary.hasStay;

  return readiness;
}

/** Options for one context load. */
export interface LoadContextOptions {
  /**
   * A trip that must be present in the result if it exists at all, even when it
   * falls outside the list window. The write paths pass the row they have just
   * touched; the single-trip screens pass the trip they are rendering.
   */
  ensureTripId?: string;
}

/**
 * The trip columns, in two tiers.
 *
 * WHY TWO:
 *   `cover_image_url` and `is_wishlist` were added after the table was created
 *   — the first in supabase/schema.sql, the second in migration 011. This
 *   project's live schema is dashboard-managed (see scripts/supabase-check.mjs:
 *   Supabase reports "No migrations"), so a column the repo takes for granted
 *   can genuinely be absent in production. PostgREST answers a select naming an
 *   unknown column with an error for the WHOLE statement, so one missing column
 *   used to return zero trips — not a trip missing a cover image, but no trips
 *   at all, for every screen, including the read-back that a freshly created
 *   trip is confirmed with.
 *
 *   So the wide select is tried first, and a failure falls back to the columns
 *   the table has always had. A traveler on a half-migrated database loses the
 *   cover image and the wishlist flag. They do not lose their trips.
 */
const TRIP_COLUMNS_FULL =
  'id, title, destination, start_date, end_date, travelers, interests, cover_image_url, is_wishlist';
const TRIP_COLUMNS_CORE = 'id, title, destination, start_date, end_date, travelers, interests';

/**
 * How many trips one context carries.
 *
 * This was 20, which is a display cap being used as a correctness boundary: a
 * traveler with twenty trips could still create the twenty-first, but the
 * read-back looked for it inside a window it had fallen outside of and reported
 * that the trip they had just made did not exist. `ensureTripId` below is the
 * real fix for that; this is the headroom.
 */
const TRIP_LIMIT = 100;

/** The trips query, with the narrow retry described above. */
async function selectTrips(
  supabase: SupabaseClient,
  filter?: { id: string }
): Promise<{ rows: TripRow[]; unavailable: boolean }> {
  const build = (columns: string) => {
    const query = supabase.from('trip_plans').select(columns);
    return filter
      ? query.eq('id', filter.id).limit(1)
      : query.order('start_date', { ascending: true, nullsFirst: false }).limit(TRIP_LIMIT);
  };

  const wide = await build(TRIP_COLUMNS_FULL);
  if (!wide.error) return { rows: (wide.data ?? []) as unknown as TripRow[], unavailable: false };
  log.warn('travel.trips_select_degraded', { error: wide.error.message });

  const core = await build(TRIP_COLUMNS_CORE);
  if (!core.error) return { rows: (core.data ?? []) as unknown as TripRow[], unavailable: false };

  // Both shapes failed: the table itself is unreachable. That is an outage, not
  // an empty account, and callers must be able to tell the difference — saying
  // "you have no trips" to someone who has ten is a worse answer than an error.
  log.error('travel.trips_select_failed', { error: core.error.message });
  return { rows: [], unavailable: true };
}

/**
 * Everything Home needs about the caller, in one round of queries.
 *
 * A signed-out visitor gets an empty context rather than an error — guests
 * browse Domner freely (§26 of the brief), they just have nothing to
 * personalise against yet.
 */
export async function loadTravelerContext(
  request: Request,
  options: LoadContextOptions = {}
): Promise<TravelerContext> {
  const now = new Date();
  const empty: TravelerContext = {
    signedIn: false,
    displayName: null,
    trips: [],
    flights: [],
    esims: [],
    now,
  };

  const supabase: SupabaseClient | null = supabaseFromRequest(request);
  if (!supabase) return empty;

  const user = await getUser(request);
  if (!user) return empty;

  const displayName =
    ((user.user_metadata?.full_name as string | undefined) ?? user.email ?? null)?.split(' ')[0] ??
    null;

  // Ninety days back is enough for post-trip memories without dragging a
  // traveler's whole history into every homepage render.
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);

  const [tripsResult, flightsResult, ordersResult, daysResult, placesResult] = await Promise.all([
    selectTrips(supabase),
    supabase
      .from('saved_flights')
      .select('flight_number, flight_date, departure_airport, arrival_airport')
      .gte('flight_date', since)
      .order('flight_date', { ascending: true })
      .limit(20),
    supabase
      .from('esim_orders')
      .select('order_number, country, plan_name, duration_days, data_gb_daily, status, fulfilled_at')
      .order('created_at', { ascending: false })
      .limit(20),
    // Both scoped by RLS to days and places hanging off this traveler's own
    // trips (itinerary_days_owner / itinerary_places_owner, migration 007), so
    // neither needs an explicit trip filter here.
    supabase.from('itinerary_days').select('id, trip_id, day_index').limit(400),
    supabase.from('itinerary_places').select('category, itinerary_day_id').limit(1000),
  ]);

  for (const result of [flightsResult, ordersResult, daysResult, placesResult]) {
    // A missing table on a partly-migrated project must degrade to "no data",
    // not to a broken homepage.
    if (result.error) log.warn('travel.context_query_failed', { error: result.error.message });
  }

  const tripRows = tripsResult.rows;
  let tripsUnavailable = tripsResult.unavailable;

  // A trip the caller names explicitly — the one they have just created, or the
  // one whose page they are on — is fetched by id when the list did not contain
  // it, so "not in the first hundred" can never be reported as "does not
  // exist". One extra query, only on the path that asks for it, and a list that
  // failed does not rule the row out: a lookup by primary key can still succeed
  // where a hundred-row scan timed out.
  if (options.ensureTripId && !tripRows.some((trip) => trip.id === options.ensureTripId)) {
    const single = await selectTrips(supabase, { id: options.ensureTripId });
    tripRows.push(...single.rows);
    // Only an unreadable table on BOTH attempts means we cannot answer.
    tripsUnavailable = tripsUnavailable && single.unavailable;
  }

  const flightRows = (flightsResult.data ?? []) as FlightRow[];
  const orderRows = (ordersResult.data ?? []) as OrderRow[];
  const signals = itinerarySignals(
    (daysResult.data ?? []) as ItineraryDayRow[],
    (placesResult.data ?? []) as ItineraryPlaceRow[]
  );

  const trips: TripSummary[] = tripRows.map((trip) => {
    const matched = matchDestination(trip.destination);
    return {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      destinationSlug: matched?.slug ?? null,
      flag: matched?.flag ?? null,
      startDate: trip.start_date,
      endDate: trip.end_date,
      travelers: trip.travelers ?? 1,
      interests: knownInterests(trip.interests),
      readiness: deriveReadiness(trip, flightRows, orderRows, signals.get(trip.id) ?? NO_ITINERARY),
      coverImageUrl: trip.cover_image_url,
      isWishlist: trip.is_wishlist ?? false,
    };
  });

  const flights: FlightSummary[] = flightRows.map((flight) => ({
    flightNumber: flight.flight_number,
    date: flight.flight_date,
    departureAirport: flight.departure_airport,
    arrivalAirport: flight.arrival_airport,
  }));

  const esims: EsimSummary[] = orderRows.map((order) => ({
    orderNumber: order.order_number,
    country: order.country,
    planName: order.plan_name,
    durationDays: order.duration_days,
    dataGbDaily: Number(order.data_gb_daily),
    status: order.status,
    fulfilledAt: order.fulfilled_at,
  }));

  return { signedIn: true, displayName, trips, flights, esims, now, tripsUnavailable };
}
