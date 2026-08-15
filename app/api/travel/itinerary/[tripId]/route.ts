import { z } from 'zod';
import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { nextDayDate, type ItineraryCategory } from '@/lib/travel/itinerary';

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
  if (!data) throw new ApiError('NOT_FOUND', 'That trip could not be found.');
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
  await requireUser(request);
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
    const { count } = await supabase.from('itinerary_places').select('*', { count: 'exact', head: true }).eq('itinerary_day_id', day.id);
    const { error } = await supabase.from('itinerary_places').insert({ itinerary_day_id: day.id, place_id: place.id, category: place.category as ItineraryCategory, sort_order: count ?? 0 });
    if (error) throw new ApiError('INTERNAL', 'Could not add that place.');
  }

  if (body.data.action === 'addIdea') {
    let { data: ideasDay } = await supabase.from('itinerary_days').select('id').eq('trip_id', tripId).eq('day_index', 0).maybeSingle();
    if (!ideasDay) {
      const { data, error } = await supabase.from('itinerary_days').insert({ trip_id: tripId, day_index: 0, date: null }).select('id').single();
      if (error || !data) throw new ApiError('INTERNAL', 'Could not prepare your Ideas list.');
      ideasDay = data;
    }
    const { data: place } = await supabase.from('destination_places').select('id,category').eq('id', body.data.placeId).eq('destination', trip.destination).maybeSingle();
    if (!place) throw new ApiError('NOT_FOUND', 'That place could not be found.');
    const { count } = await supabase.from('itinerary_places').select('*', { count: 'exact', head: true }).eq('itinerary_day_id', ideasDay.id);
    const { error } = await supabase.from('itinerary_places').insert({ itinerary_day_id: ideasDay.id, place_id: place.id, category: place.category as ItineraryCategory, sort_order: count ?? 0 });
    if (error) throw new ApiError('INTERNAL', 'Could not add that idea.');
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
    const { count } = await supabase.from('itinerary_places').select('*', { count: 'exact', head: true }).eq('itinerary_day_id', day.id);
    const { error } = await supabase.from('itinerary_places').update({ itinerary_day_id: day.id, sort_order: count ?? 0 }).eq('id', body.data.placeId);
    if (error) throw new ApiError('INTERNAL', 'Could not move that place.');
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

  if (body.data.action === 'share') {
    const { error } = await supabase.from('trip_plans').update({ is_public: true }).eq('id', tripId);
    if (error) throw new ApiError('INTERNAL', 'Could not create the share link.');
  }

  return ok(await snapshot(request, tripId));
}, { rateLimit: 'tripWrite', name: 'travel.itinerary.write' });