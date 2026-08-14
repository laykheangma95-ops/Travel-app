import { ApiError, ok, requireParam, route } from '@/lib/http';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (_request, context) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Shared itineraries are unavailable right now.');
  const token = requireParam(context, 'token');
  const { data: trip, error } = await supabase
    .from('trip_plans')
    .select('id,title,destination,start_date,end_date,share_token')
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not open this shared itinerary.');
  if (!trip) throw new ApiError('NOT_FOUND', 'This share link is no longer available.');

  const { data: days, error: daysError } = await supabase
    .from('itinerary_days').select('*').eq('trip_id', trip.id).gt('day_index', 0).order('day_index');
  if (daysError) throw new ApiError('INTERNAL', 'Could not load itinerary days.');
  const ids = (days ?? []).map((day) => day.id);
  const { data: places, error: placesError } = ids.length
    ? await supabase.from('itinerary_places').select('id,itinerary_day_id,category,time_start,time_end,notes,sort_order,place:destination_places(name,category,lat,lng,description,photo_url,source)').in('itinerary_day_id', ids).order('sort_order')
    : { data: [], error: null };
  if (placesError) throw new ApiError('INTERNAL', 'Could not load itinerary places.');

  const grouped = new Map<string, unknown[]>();
  for (const place of places ?? []) grouped.set(place.itinerary_day_id, [...(grouped.get(place.itinerary_day_id) ?? []), place]);
  return ok({ trip, days: (days ?? []).map((day) => ({ ...day, places: grouped.get(day.id) ?? [] })) });
}, { rateLimit: 'session', name: 'travel.itinerary.share' });