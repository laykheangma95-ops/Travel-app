// POST /api/travel/places/save — save a place from a destination guide onto a trip.
//
// The guide is a public, crawlable page; this is the one action on it that needs
// an account, because a saved place has to belong to somebody. The endpoint is
// deliberately thin: it validates the wire shape and hands off to
// lib/travel/savedPlaces.ts, where the decisions live (rule 9).
//
// Like every other travel write, it runs on the CALLER'S session client, never
// the service role. RLS (`trips_all_own`, `itinerary_days_owner`,
// `itinerary_places_owner`) is what confines a traveler to their own rows — this
// route checks shape, the database enforces ownership.
//
// Two answers are both successes:
//   { status: 'saved', … }      the place is on a trip
//   { status: 'needsChoice', … } more than one open trip for that country, so
//                                the traveler picks and the client posts again
//                                with tripId. Nothing was written.

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { savePlaceForTraveler } from '@/lib/travel/savedPlaces';
import { TRIP_DESTINATION_MAX } from '@/lib/travel/trips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `.strict()`, like the trip draft schema: an unknown key means a client that is
 * out of date or one trying to set something that is not the traveler's to set.
 *
 * Note what is NOT here — no name, description, category or coordinates. The
 * seeded catalogue owns all of those. The client names a place; it does not
 * describe one.
 */
const saveRequest = z
  .object({
    destination: z.string().trim().min(1).max(TRIP_DESTINATION_MAX),
    contentSlug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      // Exactly what scripts/csv-to-seed-sql.mjs generates: two slugified
      // halves joined by a colon.
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/, 'not a content slug'),
    tripId: z.string().uuid().optional(),
  })
  .strict();

export const POST = route(
  async (request) => {
    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Saving places is unavailable right now.');
    }

    const user = await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Saving places is unavailable right now.');
    }

    const parsed = saveRequest.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'That place could not be saved.');
    }

    const result = await savePlaceForTraveler(supabase, user.id, parsed.data);

    // Both outcomes are 200. `needsChoice` is not a failure — nothing went
    // wrong, the answer is a question — and giving it an error status would
    // make every client's `if (!response.ok) throw` path treat a normal branch
    // as a crash. The body's `status` is what the client switches on.
    return ok(result);
  },
  { rateLimit: 'tripWrite', name: 'travel.places.save' }
);
