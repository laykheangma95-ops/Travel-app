import { z } from 'zod';
import { ApiError, ok, readJson, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { nextDayDate, type ItineraryCategory } from '@/lib/travel/itinerary';
import { buildSmartDraft, type DraftPlace } from '@/lib/travel/smartDraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const category = z.enum(['spot', 'food', 'shopping', 'transport', 'stay', 'other']);
const preferencesSchema = z.object({
  pace: z.enum(['relaxed', 'balanced', 'full']).default('balanced'),
  interests: z.array(category).min(1).max(6).default(['spot', 'food']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
  includeSaved: z.boolean().default(true),
}).strict();

function tripDayCount(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const difference = Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000);
  return Math.min(7, Math.max(1, difference + 1));
}

export const POST = route(async (request, context) => {
  if (!getSupabase()) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');
  await requireUser(request);
  const preferences = preferencesSchema.safeParse(await readJson<unknown>(request));
  if (!preferences.success) throw new ApiError('BAD_REQUEST', 'Choose valid itinerary preferences.');

  const supabase = supabaseFromRequest(request);
  if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');

  const tripId = requireParam(context, 'tripId');
  const { data: trip, error: tripError } = await supabase
    .from('trip_plans')
    .select('id,destination,start_date,end_date')
    .eq('id', tripId)
    .maybeSingle();

  if (tripError || !trip) {
    throw new ApiError('NOT_FOUND', 'We could not read that trip to build a draft. Open it from Trips and try again.');
  }

  const [{ data: places, error: placesError }, { data: existingDays, error: daysError }] = await Promise.all([
    supabase.from('destination_places').select('id,name,category,lat,lng,created_by')
      .eq('destination', trip.destination).order('name').limit(80),
    supabase.from('itinerary_days').select('id,day_index').eq('trip_id', tripId).order('day_index'),
  ]);
  if (placesError) throw new ApiError('INTERNAL', 'Could not find recommendations for this destination.');
  if (daysError) throw new ApiError('INTERNAL', 'Could not prepare itinerary days.');
  if (!places?.length) throw new ApiError('NOT_FOUND', 'Add a saved or custom place before building a smart draft.');

  const ideasDay = existingDays?.find((day) => day.day_index === 0) ?? null;
  const { data: savedRows } = ideasDay
    ? await supabase.from('itinerary_places').select('place_id').eq('itinerary_day_id', ideasDay.id)
    : { data: [] };
  const savedPlaceIds = (savedRows ?? []).map((row) => row.place_id as string);
  const numberedDays = (existingDays ?? []).filter((day) => day.day_index > 0);
  const wantedDayCount = Math.max(numberedDays.length, tripDayCount(trip.start_date, trip.end_date) ?? 3);
  let days = numberedDays;
  if (days.length < wantedDayCount) {
    const firstNewIndex = days.length + 1;
    const rows = Array.from({ length: wantedDayCount - days.length }, (_, index) => ({
      trip_id: tripId, day_index: firstNewIndex + index,
      date: nextDayDate(trip.start_date, firstNewIndex + index), theme: null,
    }));
    const { data: created, error } = await supabase.from('itinerary_days').insert(rows).select('id,day_index').order('day_index');
    if (error || !created) throw new ApiError('INTERNAL', 'Could not create itinerary days.');
    days = [...days, ...created].sort((a, b) => a.day_index - b.day_index);
  }
  const draft = buildSmartDraft(places.map((place) => ({
    ...place, category: place.category as ItineraryCategory, lat: Number(place.lat), lng: Number(place.lng),
  })) as DraftPlace[], savedPlaceIds, days.length, preferences.data);
  if (draft.length === 0) throw new ApiError('NOT_FOUND', 'There are not enough places to build this draft.');

  // Ideas are the traveler's saved-place collection and remain untouched.
  const dayIds = days.map((day) => day.id);
  const { data: previousRows, error: backupError } = await supabase.from('itinerary_places')
    .select('id,itinerary_day_id,place_id,category,time_start,time_end,notes,sort_order')
    .in('itinerary_day_id', dayIds);
  if (backupError) throw new ApiError('INTERNAL', 'Could not safely prepare the new itinerary draft.');
  const { error: clearError } = await supabase.from('itinerary_places').delete().in('itinerary_day_id', dayIds);
  if (clearError) throw new ApiError('INTERNAL', 'Could not refresh your itinerary draft.');
  const rows = draft.flatMap((stops, dayIndex) => stops.map((stop, sortOrder) => ({
    itinerary_day_id: days[dayIndex].id, place_id: stop.place.id, category: stop.place.category,
    time_start: stop.timeStart, time_end: stop.timeEnd, notes: null, sort_order: sortOrder,
  })));
  const { error: insertError } = await supabase.from('itinerary_places').insert(rows);
  if (insertError) {
    if (previousRows?.length) await supabase.from('itinerary_places').insert(previousRows);
    throw new ApiError('INTERNAL', 'Could not build your itinerary draft. Your previous schedule was restored.');
  }
  return ok({ generated: true, placeCount: rows.length, dayCount: draft.length, strategy: 'smart-draft' });
}, { rateLimit: 'tripWrite', name: 'travel.itinerary.generate' });
