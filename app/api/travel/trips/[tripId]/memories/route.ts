// GET    /api/travel/trips/:id/memories — the notes saved to one trip.
// POST   /api/travel/trips/:id/memories — save one.
// DELETE /api/travel/trips/:id/memories — remove one, by id in the body.
//
// The `trip_memories` table has been in the schema since the beginning and
// nothing has ever read or written it. The memories screen rendered six
// hardcoded emoji — Wat Arun, boat noodles, Pattaya — identically for every
// trip, alongside invented statistics ("5.4 GB used", "6 places visited").
//
// Everything goes through the caller's session client, so `memories_all_own`
// (schema.sql:529) is what confines a traveler to their own rows. The route
// checks shape; the database checks ownership.
//
// PHOTOS ARE NOT HANDLED HERE. `photo_url` stays null: there is no storage
// bucket configured in this project, and inventing one is not this route's
// call. A written note needs no bucket, and is the part that can be honest
// today.

import { z } from 'zod';
import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const MEMORY_CAPTION_MAX = 280;
export const MEMORY_LOCATION_MAX = 120;
/** Enough for a long trip, low enough that one trip cannot fill the table. */
export const MEMORIES_PER_TRIP_MAX = 200;

export interface TripMemory {
  id: string;
  caption: string;
  location: string | null;
  takenAt: string | null;
  photoUrl: string | null;
}

const createSchema = z
  .object({
    caption: z.string().trim().min(1).max(MEMORY_CAPTION_MAX),
    location: z.string().trim().max(MEMORY_LOCATION_MAX).nullable().default(null),
    takenAt: z.string().datetime().nullable().default(null),
  })
  .strict();

const deleteSchema = z.object({ id: z.string().uuid() }).strict();

/** Confirms the trip is the caller's before touching anything hanging off it. */
async function ownedTrip(request: Request, tripId: string) {
  const supabase = supabaseFromRequest(request);
  if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Memories are unavailable right now.');
  const { data, error } = await supabase
    .from('trip_plans')
    .select('id')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not open that trip.');
  if (!data) throw new ApiError('NOT_FOUND', 'That trip could not be found.');
  return supabase;
}

function toMemory(row: Record<string, unknown>): TripMemory {
  return {
    id: row.id as string,
    caption: (row.caption as string | null) ?? '',
    location: (row.location as string | null) ?? null,
    takenAt: (row.taken_at as string | null) ?? null,
    photoUrl: (row.photo_url as string | null) ?? null,
  };
}

export const GET = route(
  async (request, context) => {
    if (!getSupabase()) return ok({ memories: [], unconfigured: true });
    await requireUser(request);
    const tripId = requireParam(context, 'tripId');
    const supabase = await ownedTrip(request, tripId);

    const { data, error } = await supabase
      .from('trip_memories')
      .select('id, caption, location, taken_at, photo_url')
      .eq('trip_id', tripId)
      .order('taken_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(MEMORIES_PER_TRIP_MAX);

    if (error) throw new ApiError('INTERNAL', 'Could not load your memories.');
    return ok({ memories: (data ?? []).map(toMemory) });
  },
  { rateLimit: 'session', name: 'travel.memories.read' }
);

export const POST = route(
  async (request, context) => {
    if (!getSupabase()) throw new ApiError('SERVICE_UNAVAILABLE', 'Memories are unavailable right now.');
    const user = await requireUser(request);
    const tripId = requireParam(context, 'tripId');
    const supabase = await ownedTrip(request, tripId);

    const parsed = createSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Write a short note to save it.');

    const { count } = await supabase
      .from('trip_memories')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId);

    if ((count ?? 0) >= MEMORIES_PER_TRIP_MAX) {
      throw new ApiError('BAD_REQUEST', 'This trip has as many notes as we can keep.');
    }

    const { data, error } = await supabase
      .from('trip_memories')
      .insert({
        trip_id: tripId,
        user_id: user.id,
        caption: parsed.data.caption,
        location: parsed.data.location,
        taken_at: parsed.data.takenAt,
      })
      .select('id, caption, location, taken_at, photo_url')
      .single();

    if (error || !data) throw new ApiError('INTERNAL', 'Could not save that note. Please try again.');
    return ok({ memory: toMemory(data) }, { status: 201 });
  },
  { rateLimit: 'tripWrite', name: 'travel.memories.create' }
);

export const DELETE = route(
  async (request, context) => {
    if (!getSupabase()) throw new ApiError('SERVICE_UNAVAILABLE', 'Memories are unavailable right now.');
    await requireUser(request);
    const tripId = requireParam(context, 'tripId');
    const supabase = await ownedTrip(request, tripId);

    const parsed = deleteSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'That note could not be identified.');

    const { data, error } = await supabase
      .from('trip_memories')
      .delete()
      .eq('id', parsed.data.id)
      .eq('trip_id', tripId)
      .select('id')
      .maybeSingle();

    if (error) throw new ApiError('INTERNAL', 'Could not remove that note.');
    if (!data) throw new ApiError('NOT_FOUND', 'That note could not be found.');
    return ok({ deleted: parsed.data.id });
  },
  { rateLimit: 'tripWrite', name: 'travel.memories.delete' }
);
