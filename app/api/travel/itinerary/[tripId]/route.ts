import { z } from 'zod';
import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { isUniqueViolation } from '@/lib/supabaseError';
import {
  nextDayDate,
  minutesFromTime,
  PLACE_DESCRIPTION_MAX,
  PLACE_NAME_MAX,
  type ItineraryCategory,
} from '@/lib/travel/itinerary';
import { addIdeaToTrip, insertAtNextSortOrder, nextSortOrder } from '@/lib/travel/savedPlaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const category = z.enum(['spot', 'food', 'shopping', 'transport', 'stay', 'other']);
const mutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('addDay') }).strict(),
  z.object({ action: z.literal('addPlace'), dayId: z.string().uuid(), placeId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('addIdea'), placeId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('reorder'), dayId: z.string().uuid(), placeIds: z.array(z.string().uuid()).min(1) }).strict(),
  z.object({ action: z.literal('move'), placeId: z.string().uuid(), dayId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('update'), placeId: z.string().uuid(), timeStart: z.string().nullable(), timeEnd: z.string().nullable(), notes: z.string().max(1000).nullable(), category: category }).strict(),
  z.object({ action: z.literal('delete'), placeId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('share') }).strict(),
  z.object({ action: z.literal('unshare') }).strict(),
  // A place the traveler adds themselves. Without this, every destination with
  // no editorial seed — 217 of the 242 the trip form offers — had an itinerary
  // builder with nothing to put in it.
  z
    .object({
      action: z.literal('addCustom'),
      name: z.string().trim().min(1).max(PLACE_NAME_MAX),
      description: z.string().trim().max(PLACE_DESCRIPTION_MAX).default(''),
      category: category.default('other'),
      lat: z.number().min(-90).max(90).nullable().default(null),
      lng: z.number().min(-180).max(180).nullable().default(null),
      openingStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
      openingEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
      /** Where to put it: a day id, or 'ideas' for the unscheduled list. */
      target: z.union([z.string().uuid(), z.literal('ideas')]).default('ideas'),
    })
    .strict(),
]);

async function ownedTrip(request: Request, tripId: string) {
  const supabase = supabaseFromRequest(request);
  if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');
  const { data, error } = await supabase
    .from('trip_plans')
    .select('id,title,destination,start_date,end_date,is_public,share_token')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load this itinerary.');
  if (!data) {
    throw new ApiError('NOT_FOUND', 'We could not open that itinerary. The trip may have been deleted.');
  }
  return { supabase, trip: data };
}

async function snapshot(request: Request, tripId: string) {
  const { supabase, trip } = await ownedTrip(request, tripId);
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days').select('*').eq('trip_id', tripId).order('day_index');
  if (daysError) throw new ApiError('INTERNAL', 'Could not load itinerary days.');

  const dayRows = days ?? [];
  const dayIds = dayRows.map((day) => day.id);
  const { data: rows, error: placesError } = dayIds.length
    ? await supabase.from('itinerary_places').select('*, place:destination_places(*)').in('itinerary_day_id', dayIds).order('sort_order')
    : { data: [], error: null };
  if (placesError) throw new ApiError('INTERNAL', 'Could not load itinerary places.');

  const { data: curatedPlaces, error: curatedError } = await supabase
    .from('destination_places').select('*').eq('destination', trip.destination).order('name');
  if (curatedError) throw new ApiError('INTERNAL', 'Could not load places for this destination.');

  const byDay = new Map<string, unknown[]>();
  for (const place of rows ?? []) {
    const current = byDay.get(place.itinerary_day_id) ?? [];
    current.push(place);
    byDay.set(place.itinerary_day_id, current);
  }

  const ideas = dayRows.find((day) => day.day_index === 0);
  return {
    trip,
    days: dayRows.filter((day) => day.day_index > 0).map((day) => ({ ...day, places: byDay.get(day.id) ?? [] })),
    ideas: ideas ? byDay.get(ideas.id) ?? [] : [],
    curatedPlaces: curatedPlaces ?? [],
  };
}

export const GET = route(async (request, context) => {
  if (!getSupabase()) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');
  await requireUser(request);
  return ok(await snapshot(request, requireParam(context, 'tripId')));
}, { rateLimit: 'session', name: 'travel.itinerary.read' });

export const PATCH = route(async (request, context) => {
  if (!getSupabase()) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');
  const user = await requireUser(request);
  const tripId = requireParam(context, 'tripId');
  const body = mutation.safeParse(await readJson<unknown>(request));
  if (!body.success) throw new ApiError('BAD_REQUEST', 'That itinerary change is not valid.');

  const { supabase, trip } = await ownedTrip(request, tripId);
  if (body.data.action === 'addDay') {
    const { data: existing } = await supabase.from('itinerary_days').select('day_index').eq('trip_id', tripId).order('day_index', { ascending: false }).limit(1);
    const dayIndex = Math.max(0, existing?.[0]?.day_index ?? 0) + 1;
    const { error } = await supabase.from('itinerary_days').insert({ trip_id: tripId, day_index: dayIndex, date: nextDayDate(trip.start_date, dayIndex) });
    if (error) throw new ApiError('INTERNAL', 'Could not add a day.');
  }

  if (body.data.action === 'addPlace') {
    const [{ data: day }, { data: place }] = await Promise.all([
      supabase.from('itinerary_days').select('id').eq('id', body.data.dayId).eq('trip_id', tripId).maybeSingle(),
      supabase.from('destination_places').select('id,category').eq('id', body.data.placeId).eq('destination', trip.destination).maybeSingle(),
    ]);
    if (!day || !place) throw new ApiError('NOT_FOUND', 'That place or day could not be found.');
    const added = await insertAtNextSortOrder(supabase, day.id, {
      place_id: place.id,
      category: place.category as ItineraryCategory,
    });
    if (!added) throw new ApiError('INTERNAL', 'Could not add that place.');
  }

  // Lives in lib/travel/savedPlaces.ts because saving a place from a
  // destination guide runs the identical steps from a different entry point.
  if (body.data.action === 'addIdea') {
    await addIdeaToTrip(supabase, tripId, body.data.placeId);
  }

  if (body.data.action === 'reorder') {
    const { data: day } = await supabase.from('itinerary_days').select('id').eq('id', body.data.dayId).eq('trip_id', tripId).maybeSingle();
    if (!day) throw new ApiError('NOT_FOUND', 'That day could not be found.');
    // Move all touched rows out of the unique sort-order range first. Updating
    // 0→1 before 1→0 would otherwise violate the unique constraint midway.
    for (const [index, placeId] of body.data.placeIds.entries()) {
      const { error } = await supabase.from('itinerary_places').update({ sort_order: 10_000 + index }).eq('id', placeId).eq('itinerary_day_id', day.id);
      if (error) throw new ApiError('INTERNAL', 'Could not reorder places.');
    }
    for (const [sortOrder, placeId] of body.data.placeIds.entries()) {
      const { error } = await supabase.from('itinerary_places').update({ sort_order: sortOrder }).eq('id', placeId).eq('itinerary_day_id', day.id);
      if (error) throw new ApiError('INTERNAL', 'Could not reorder places.');
    }
  }

  if (body.data.action === 'move') {
    const { data: day } = await supabase.from('itinerary_days').select('id').eq('id', body.data.dayId).eq('trip_id', tripId).maybeSingle();
    if (!day) throw new ApiError('NOT_FOUND', 'That day could not be found.');
    // Same MAX(sort_order)+1 reasoning as insertAtNextSortOrder — a moved-into
    // day is not guaranteed dense, so COUNT(*) can hand back a slot another
    // row already occupies. One bounded retry against a fresh MAX on a
    // concurrent collision (23505); a second collision is a real failure.
    let moved = false;
    for (let attempt = 0; attempt < 2 && !moved; attempt += 1) {
      const sortOrder = await nextSortOrder(supabase, day.id);
      const { error } = await supabase
        .from('itinerary_places')
        .update({ itinerary_day_id: day.id, sort_order: sortOrder })
        .eq('id', body.data.placeId);
      if (!error) {
        moved = true;
      } else if (!isUniqueViolation(error)) {
        throw new ApiError('INTERNAL', 'Could not move that place.');
      }
    }
    if (!moved) throw new ApiError('INTERNAL', 'Could not move that place.');
  }

  if (body.data.action === 'update') {
    const { error } = await supabase.from('itinerary_places').update({
      time_start: body.data.timeStart, time_end: body.data.timeEnd, notes: body.data.notes, category: body.data.category,
    }).eq('id', body.data.placeId);
    if (error) throw new ApiError('INTERNAL', 'Could not update that place.');
  }

  if (body.data.action === 'delete') {
    const { error } = await supabase.from('itinerary_places').delete().eq('id', body.data.placeId);
    if (error) throw new ApiError('INTERNAL', 'Could not remove that place.');
  }

  if (body.data.action === 'addCustom') {
    const openingStart = body.data.openingStart;
    const openingEnd = body.data.openingEnd;
    if (Boolean(openingStart) !== Boolean(openingEnd)) {
      throw new ApiError('BAD_REQUEST', 'Add both an opening and closing time, or leave both blank.');
    }
    if (openingStart && openingEnd && (minutesFromTime(openingEnd) ?? 0) <= (minutesFromTime(openingStart) ?? 0)) {
      throw new ApiError('BAD_REQUEST', 'Closing time must be after opening time.');
    }
    // Stamped with the caller's id, so migration 009's policies scope it to
    // them: nobody else can read it, and it can never be mistaken for part of
    // the editorial catalogue.
    const { data: place, error: placeError } = await supabase
      .from('destination_places')
      .insert({
        destination: trip.destination,
        name: body.data.name,
        category: body.data.category,
        // A place with no coordinates simply does not get a map pin. Asking a
        // traveler for a latitude before they can note down their hotel would
        // be the wrong trade.
        lat: body.data.lat ?? 0,
        lng: body.data.lng ?? 0,
        description: body.data.description,
        source: 'editorial',
        created_by: user.id,
        ...(openingStart && openingEnd
          ? { opening_hours: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [
                day, [{ open: openingStart, close: openingEnd }],
              ])) }
          : {}),
      })
      .select('id, category')
      .single();

    if (placeError || !place) {
      throw new ApiError('INTERNAL', 'Could not save that place. It may already be on your list.');
    }

    let dayId: string | null = null;
    if (body.data.target === 'ideas') {
      const { data: existing } = await supabase
        .from('itinerary_days')
        .select('id')
        .eq('trip_id', tripId)
        .eq('day_index', 0)
        .maybeSingle();
      if (existing) {
        dayId = existing.id;
      } else {
        const { data: created, error: createError } = await supabase
          .from('itinerary_days')
          .insert({ trip_id: tripId, day_index: 0, date: null })
          .select('id')
          .single();
        if (createError || !created) throw new ApiError('INTERNAL', 'Could not prepare your Ideas list.');
        dayId = created.id;
      }
    } else {
      const { data: day } = await supabase
        .from('itinerary_days')
        .select('id')
        .eq('id', body.data.target)
        .eq('trip_id', tripId)
        .maybeSingle();
      if (!day) throw new ApiError('NOT_FOUND', 'That day could not be found.');
      dayId = day.id;
    }

    if (!dayId) throw new ApiError('INTERNAL', 'Could not prepare your itinerary.');
    const added = await insertAtNextSortOrder(supabase, dayId, {
      place_id: place.id,
      category: place.category as ItineraryCategory,
    });
    if (!added) throw new ApiError('INTERNAL', 'Could not add that place to your trip.');
  }

  if (body.data.action === 'share') {
    const { error } = await supabase.from('trip_plans').update({ is_public: true }).eq('id', tripId);
    if (error) throw new ApiError('INTERNAL', 'Could not create the share link.');
  }

  // Sharing has to be reversible. The share action only ever set is_public
  // true, so a link, once created, was permanent.
  if (body.data.action === 'unshare') {
    const { error } = await supabase.from('trip_plans').update({ is_public: false }).eq('id', tripId);
    if (error) throw new ApiError('INTERNAL', 'Could not turn off the share link.');
  }

  return ok(await snapshot(request, tripId));
}, { rateLimit: 'tripWrite', name: 'travel.itinerary.write' });
