// ─────────────────────────────────────────────────────────────────────────────
// Making a trip one continuous object rather than four disconnected screens.
//
// Two things happen the moment a trip is created, and neither used to:
//
//   SEEDING THE GRID
//     A trip that knows it runs 25–27 August knows it is three days long, and
//     had nothing to show for it: `itinerary_days` rows appeared only when the
//     traveler pressed "Add day" or ran the smart draft. So the first thing a
//     new trip showed was a chooser, not a plan. Now the days exist as soon as
//     the dates do — day 0 (the private Ideas list) always, numbered days when
//     there are dates to number them from.
//
//   ADOPTING THE WISHLIST TRIP
//     Saving a place before there is a trip to save it to auto-creates one, with
//     `is_wishlist = true` (lib/travel/savedPlaces.ts). Someone who saves three
//     places in Malaysia and then fills in the New Trip form used to end up with
//     TWO Malaysia rows: the real trip, and a wishlist trip holding every idea
//     they had gathered. The ideas never arrived, and the next save saw two
//     matching trips and stopped to ask which one — a question created entirely
//     by this gap.
//
//     So a create that matches exactly one dateless wishlist trip for the same
//     destination UPGRADES that row instead of inserting beside it. The ideas
//     are already attached, because it is the same trip. Nothing is copied and
//     nothing is left behind.
//
// Everything here is best-effort by design. The trip row is the commitment; a
// day grid is an enrichment, and a failure to seed one must never turn a
// committed write into an error the traveler sees. That is the same rule
// tripAfterWrite exists for.
//
// SERVER ONLY.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { nextDayDate, tripDayCount } from './itinerary';
import { normalizeTripDraft, type TripDraft } from './trips';

/** One `itinerary_days` row, as much of it as seeding cares about. */
interface DayRow {
  id: string;
  day_index: number;
  date: string | null;
}

/**
 * The wishlist trip this create should become, if there is exactly one.
 *
 * Deliberately narrow. It adopts a row only when every one of these holds:
 *
 *   - it belongs to the caller. RLS would stop a write to anyone else's row,
 *     but `trips_public_read` (schema.sql:527) means a SELECT can *see* other
 *     people's public trips — so choosing a row to write to by destination
 *     alone is not safe, and the owner filter is load-bearing here rather than
 *     a duplicate of the policy.
 *   - it is a wishlist trip. A real trip the traveler made earlier is never
 *     silently overwritten by a new one.
 *   - it has no dates, which every auto-created trip satisfies. A wishlist trip
 *     that has since been given dates has been worked on, and is left alone.
 *   - it is the only match. Two candidates is exactly the ambiguity this is
 *     meant to remove; picking one at random would be inventing an answer.
 *
 * Returns null on any doubt, including a database that has never had migration
 * 011 applied and therefore has no `is_wishlist` column at all. Adoption is an
 * improvement on inserting, never a precondition for it.
 */
export async function adoptableWishlistTrip(
  supabase: SupabaseClient,
  userId: string,
  destination: string
): Promise<string | null> {
  const wanted = destination.trim();
  if (!wanted) return null;

  const { data, error } = await supabase
    .from('trip_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('destination', wanted)
    .eq('is_wishlist', true)
    .is('start_date', null)
    .limit(2);

  if (error) {
    // 42703 here means migration 011 was never applied. Not an error worth
    // failing a create over — the traveler simply gets a second trip, exactly
    // as they did before this existed.
    log.warn('travel.wishlist_adopt_unavailable', { error: error.message });
    return null;
  }

  if (!data || data.length !== 1) return null;
  return data[0].id as string;
}

/**
 * Turn the adopted wishlist trip into the trip the traveler just described.
 *
 * Returns false if the update touched nothing, so the caller can fall back to
 * inserting rather than reporting a failure.
 */
export async function adoptWishlistTrip(
  supabase: SupabaseClient,
  tripId: string,
  draft: TripDraft
): Promise<boolean> {
  const { data, error } = await supabase
    .from('trip_plans')
    .update({ ...normalizeTripDraft(draft), is_wishlist: false })
    .eq('id', tripId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    log.warn('travel.wishlist_adopt_failed', { tripId, error: error?.message ?? 'no row' });
    return false;
  }
  return true;
}

/**
 * Bring the day grid into line with the trip's dates.
 *
 * Idempotent, and safe to call on every write:
 *
 *   - day 0 is created once and never again — it is the Ideas list, and
 *     savedPlaces.ts creates the same row from the other direction.
 *   - a numbered day is inserted only where that index is missing, so an
 *     existing plan is never duplicated.
 *   - existing days are re-dated when the trip moves. A day's date is derived
 *     from the start date and nothing else — no screen lets a traveler set one
 *     by hand — so recomputing it is a correction, not an overwrite. Without
 *     this, shifting a trip a week later leaves Day 1 stamped with the old
 *     departure date.
 *   - days beyond the new length are LEFT ALONE. Shortening a trip must not
 *     delete places somebody put on Day 5.
 */
export async function seedTripDays(
  supabase: SupabaseClient,
  tripId: string,
  draft: Pick<TripDraft, 'startDate' | 'endDate'>
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('itinerary_days')
      .select('id, day_index, date')
      .eq('trip_id', tripId);

    if (error) {
      log.warn('travel.seed_days_read_failed', { tripId, error: error.message });
      return;
    }

    const existing = (data ?? []) as DayRow[];
    const have = new Map(existing.map((day) => [day.day_index, day]));

    // Both ends are needed to know the length; a start alone is one day.
    const wanted = draft.startDate
      ? tripDayCount(draft.startDate, draft.endDate ?? draft.startDate) ?? 0
      : 0;

    const rows: { trip_id: string; day_index: number; date: string | null }[] = [];
    if (!have.has(0)) rows.push({ trip_id: tripId, day_index: 0, date: null });
    for (let index = 1; index <= wanted; index += 1) {
      if (!have.has(index)) {
        rows.push({ trip_id: tripId, day_index: index, date: nextDayDate(draft.startDate, index) });
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('itinerary_days').insert(rows);
      // UNIQUE (trip_id, day_index) — a concurrent create losing this race is
      // the row already being there, which is the outcome we wanted anyway.
      if (insertError) log.warn('travel.seed_days_insert_failed', { tripId, error: insertError.message });
    }

    const restamp = existing.filter(
      (day) => day.day_index > 0 && day.date !== nextDayDate(draft.startDate, day.day_index)
    );
    for (const day of restamp) {
      const { error: dateError } = await supabase
        .from('itinerary_days')
        .update({ date: nextDayDate(draft.startDate, day.day_index) })
        .eq('id', day.id);
      if (dateError) log.warn('travel.seed_days_restamp_failed', { tripId, error: dateError.message });
    }
  } catch (error) {
    // Seeding is an enrichment of a write that has already committed. It has no
    // business throwing into the traveler's response.
    log.warn('travel.seed_days_failed', {
      tripId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
