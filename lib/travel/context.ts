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

interface TripRow {
  id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
  generated_itinerary: Record<string, unknown> | null;
  cover_image_url: string | null;
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

interface ChecklistRow {
  trip_id: string;
  category: string;
  is_completed: boolean;
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

/** Does an ISO date fall inside the trip's window (inclusive)? */
function withinTrip(trip: TripRow, isoDate: string): boolean {
  if (!trip.start_date) return false;
  const end = trip.end_date ?? trip.start_date;
  return isoDate >= trip.start_date && isoDate <= end;
}

/**
 * Work out how ready a trip is.
 *
 * Four of the five steps are answerable from tables that exist today. `stay` is
 * read out of generated_itinerary because there is no bookings table yet —
 * hotels are a later product type (CLAUDE.md §1). It reports honestly as "not
 * done" rather than pretending, which is the right failure: the worst outcome
 * would be telling someone their accommodation is sorted when nothing recorded
 * it.
 */
function deriveReadiness(
  trip: TripRow,
  flights: FlightRow[],
  orders: OrderRow[],
  checklist: ChecklistRow[]
): Readiness {
  const readiness = emptyReadiness();
  const itinerary = trip.generated_itinerary ?? null;

  readiness.flight = flights.some((flight) => withinTrip(trip, flight.flight_date));

  const stay = itinerary?.stay ?? itinerary?.hotel ?? itinerary?.accommodation;
  readiness.stay = Boolean(stay);

  const destination = trip.destination.trim().toLowerCase();
  readiness.esim = orders.some(
    (order) =>
      (order.status === 'paid' || order.status === 'fulfilled') &&
      (order.country.trim().toLowerCase() === destination ||
        destination.includes(order.country.trim().toLowerCase()))
  );

  const places = itinerary?.places;
  readiness.places =
    (Array.isArray(places) && places.length > 0) ||
    checklist.some((item) => item.trip_id === trip.id && item.category === 'places');

  readiness.itinerary = Boolean(
    itinerary && Object.keys(itinerary).length > 0
  );

  return readiness;
}

/**
 * Everything Home needs about the caller, in one round of queries.
 *
 * A signed-out visitor gets an empty context rather than an error — guests
 * browse Domner freely (§26 of the brief), they just have nothing to
 * personalise against yet.
 */
export async function loadTravelerContext(request: Request): Promise<TravelerContext> {
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

  const [tripsResult, flightsResult, ordersResult, checklistResult] = await Promise.all([
    supabase
      .from('trip_plans')
      .select('id, title, destination, start_date, end_date, travelers, generated_itinerary, cover_image_url')
      .order('start_date', { ascending: true, nullsFirst: false })
      .limit(20),
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
    supabase.from('trip_checklist_items').select('trip_id, category, is_completed').limit(200),
  ]);

  for (const result of [tripsResult, flightsResult, ordersResult, checklistResult]) {
    // A missing table on a partly-migrated project must degrade to "no data",
    // not to a broken homepage.
    if (result.error) log.warn('travel.context_query_failed', { error: result.error.message });
  }

  const tripRows = (tripsResult.data ?? []) as TripRow[];
  const flightRows = (flightsResult.data ?? []) as FlightRow[];
  const orderRows = (ordersResult.data ?? []) as OrderRow[];
  const checklistRows = (checklistResult.data ?? []) as ChecklistRow[];

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
      readiness: deriveReadiness(trip, flightRows, orderRows, checklistRows),
      coverImageUrl: trip.cover_image_url,
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

  return { signedIn: true, displayName, trips, flights, esims, now };
}
