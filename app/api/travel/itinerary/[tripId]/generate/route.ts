import { ApiError, ok, requireParam, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { nextDayDate } from '@/lib/travel/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (request, context) => {
  if (!getSupabase()) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');
  await requireUser(request);

  const supabase = supabaseFromRequest(request);
  if (!supabase) throw new ApiError('SERVICE_UNAVAILABLE', 'Itinerary is unavailable right now.');

  const tripId = requireParam(context, 'tripId');
  const { data: trip, error: tripError } = await supabase
    .from('trip_plans')
    .select('id, destination, start_date')
    .eq('id', tripId)
    .maybeSingle();

  if (tripError || !trip) throw new ApiError('NOT_FOUND', 'That trip could not be found.');

  // Prefer editorially marked AI places. The fallback keeps this usable for
  // destinations that have curated places but not yet enough AI suggestions.
  const { data: aiPlaces, error: placesError } = await supabase
    .from('destination_places')
    .select('id, category')
    .eq('destination', trip.destination)
    .eq('source', 'ai_generated')
    .order('name')
    .limit(12);

  if (placesError) throw new ApiError('INTERNAL', 'Could not find recommendations for this destination.');

  let places = aiPlaces ?? [];
  if (places.length === 0) {
    const { data: fallbackPlaces } = await supabase
      .from('destination_places')
      .select('id, category')
      .eq('destination', trip.destination)
      .order('name')
      .limit(12);
    places = fallbackPlaces ?? [];
  }

  if (places.length === 0) {
    throw new ApiError('NOT_FOUND', 'We do not have enough recommendations for this destination yet.');
  }

  const { data: existingDays, error: daysError } = await supabase
    .from('itinerary_days')
    .select('id, day_index')
    .eq('trip_id', tripId)
    .gt('day_index', 0)
    .order('day_index');

  if (daysError) throw new ApiError('INTERNAL', 'Could not prepare itinerary days.');

  let days = existingDays ?? [];
  if (days.length === 0) {
    const dayCount = Math.min(3, Math.max(1, places.length));
    const rows = Array.from({ length: dayCount }, (_, index) => ({
      trip_id: tripId,
      day_index: index + 1,
      date: nextDayDate(trip.start_date, index + 1),
    }));
    const { data: createdDays, error: createDaysError } = await supabase
      .from('itinerary_days')
      .insert(rows)
      .select('id, day_index')
      .order('day_index');
    if (createDaysError || !createdDays) throw new ApiError('INTERNAL', 'Could not create itinerary days.');
    days = createdDays;
  }

  const { data: dayZero } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('trip_id', tripId)
    .eq('day_index', 0)
    .maybeSingle();

  const dayIds = days.map((day) => day.id);
  const { error: clearError } = await supabase
    .from('itinerary_places')
    .delete()
    .in('itinerary_day_id', dayZero ? [dayZero.id, ...dayIds] : dayIds);

  if (clearError) throw new ApiError('INTERNAL', 'Could not refresh your itinerary draft.');

  const rows = places.map((place, index) => ({
    itinerary_day_id: days[index % days.length].id,
    place_id: place.id,
    category: place.category,
    sort_order: Math.floor(index / days.length),
  }));

  const { error: insertError } = await supabase.from('itinerary_places').insert(rows);
  if (insertError) throw new ApiError('INTERNAL', 'Could not build your itinerary draft.');

  return ok({ generated: true, placeCount: places.length, dayCount: days.length });
}, { rateLimit: 'tripWrite', name: 'travel.itinerary.generate' });
