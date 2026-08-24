// POST /api/travel/places/import — save the places the traveler ticked in the
// importer onto a trip.
//
// The write half of the pair. app/api/travel/extract found the places and wrote
// nothing; this is where they land. Keeping the write separate is what lets the
// traveler edit a name, un-tick a bad guess and choose the trip before anything
// is committed.
//
// Deliberately thin: it validates the wire shape and hands off to
// lib/travel/placeImport.ts, where the decisions live (rule 9). Like every other
// travel write it runs on the CALLER'S session client, never the service role —
// RLS is what confines a traveler to their own rows.
//
// NOTHING IS TRUSTED FROM THE CLIENT HERE BEYOND THE PLACE ITSELF. A place's
// name, note, category and pin are the traveler's own content, and they may
// edit all four in the review sheet before saving — so they are accepted, and
// bounded. The trip is resolved server-side and `created_by` is stamped from
// the session, never from the body.

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { PLACE_DESCRIPTION_MAX, PLACE_NAME_MAX } from '@/lib/travel/itinerary';
import { importPlacesToTrip, MAX_IMPORT_PLACES } from '@/lib/travel/placeImport';
import { TRIP_DESTINATION_MAX, TRIP_TITLE_MAX } from '@/lib/travel/trips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const place = z
  .object({
    name: z.string().trim().min(1).max(PLACE_NAME_MAX),
    description: z.string().trim().max(PLACE_DESCRIPTION_MAX).default(''),
    category: z.enum(['spot', 'food', 'shopping', 'transport', 'stay', 'other']).default('other'),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
  })
  .strict();

/**
 * `.strict()`, like the trip draft schema: an unknown key means a client that
 * is out of date, or one trying to set something that is not the traveler's to
 * set — `created_by` and `source` being the two that matter.
 */
const importRequest = z
  .object({
    places: z.array(place).min(1).max(MAX_IMPORT_PLACES),
    destination: z.string().trim().min(1).max(TRIP_DESTINATION_MAX),
    tripId: z.string().uuid().optional(),
    title: z.string().trim().max(TRIP_TITLE_MAX).optional(),
    newTrip: z.boolean().optional(),
    /**
     * The extraction these places came from, as returned by
     * /api/travel/extract. Only used to look up provenance the server already
     * recorded — the source URL itself is never taken from the client.
     */
    importId: z.string().uuid().optional(),
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

    const parsed = importRequest.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'Those places could not be saved.');
    }

    const { places, destination, tripId, title, newTrip, importId } = parsed.data;

    const result = await importPlacesToTrip(
      supabase,
      user.id,
      places.map((entry) => ({
        name: entry.name,
        description: entry.description,
        category: entry.category,
        lat: entry.lat,
        lng: entry.lng,
      })),
      { tripId, destination, title, forceNew: newTrip },
      { importId }
    );

    // A partial success is still a 200. `added`, `skipped` and `failed` are
    // what the client reports, and an error status on "eight of nine saved"
    // would make every `if (!response.ok) throw` path throw away the eight.
    return ok(result);
  },
  { rateLimit: 'tripWrite', name: 'travel.places.import' }
);
