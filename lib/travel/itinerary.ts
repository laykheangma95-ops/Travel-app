export type ItineraryCategory = 'spot' | 'food' | 'shopping' | 'transport' | 'other';

export interface CuratedPlace {
  id: string;
  name: string;
  category: ItineraryCategory;
  lat: number;
  lng: number;
  description: string;
  photo_url: string | null;
  source: 'editorial' | 'ai_generated';
}

export interface ItineraryPlace {
  id: string;
  place_id: string;
  category: ItineraryCategory;
  time_start: string | null;
  time_end: string | null;
  notes: string | null;
  sort_order: number;
  place: CuratedPlace;
}

export interface ItineraryDay {
  id: string;
  day_index: number;
  date: string | null;
  theme: string | null;
  places: ItineraryPlace[];
}

export interface ItineraryPayload {
  trip: { id: string; title: string; destination: string; start_date: string | null; end_date: string | null; is_public: boolean; share_token: string };
  days: ItineraryDay[];
  ideas: ItineraryPlace[];
  curatedPlaces: CuratedPlace[];
}

export function nextDayDate(startDate: string | null, dayIndex: number): string | null {
  if (!startDate) return null;
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex - 1);
  return date.toISOString().slice(0, 10);
}

export function straightLineKm(a: CuratedPlace, b: CuratedPlace): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}