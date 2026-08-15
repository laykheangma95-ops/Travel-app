import type { ItineraryCategory } from './itinerary';

export type DraftPace = 'relaxed' | 'balanced' | 'full';
export interface DraftPreferences {
  pace: DraftPace;
  interests: ItineraryCategory[];
  startTime: string;
  includeSaved: boolean;
}
export interface DraftPlace {
  id: string;
  name: string;
  category: ItineraryCategory;
  lat: number;
  lng: number;
  created_by: string | null;
}
export interface DraftStop { place: DraftPlace; timeStart: string; timeEnd: string }

const PER_DAY: Record<DraftPace, number> = { relaxed: 3, balanced: 4, full: 5 };
const VISIT_MINUTES: Record<ItineraryCategory, number> = {
  spot: 100, food: 75, shopping: 90, transport: 60, stay: 45, other: 75,
};

function hhmm(minutes: number): string {
  const safe = Math.min(23 * 60 + 59, Math.max(0, minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
function startMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
function hasCoordinates(place: DraftPlace): boolean { return place.lat !== 0 || place.lng !== 0 }
function distanceKm(a: DraftPlace, b: DraftPlace): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Deterministic, structured personalization with geographically coherent days. */
export function buildSmartDraft(
  places: DraftPlace[], savedPlaceIds: string[], dayCount: number, preferences: DraftPreferences
): DraftStop[][] {
  const saved = new Set(savedPlaceIds);
  const wanted = new Set(preferences.interests);
  const capacity = Math.max(1, dayCount) * PER_DAY[preferences.pace];
  const ranked = [...places].sort((a, b) => {
    const score = (place: DraftPlace) =>
      (preferences.includeSaved && saved.has(place.id) ? 100 : 0) +
      (place.created_by ? 20 : 0) + (wanted.has(place.category) ? 10 : 0) -
      (place.category === 'transport' ? 3 : 0);
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });
  const remaining = ranked.slice(0, capacity);
  if (remaining.length === 0) return [];

  const ordered: DraftPlace[] = [];
  const anchorIndex = remaining.findIndex((place) =>
    preferences.includeSaved && saved.has(place.id) && place.category === 'stay'
  );
  ordered.push(remaining.splice(anchorIndex >= 0 ? anchorIndex : 0, 1)[0]);
  while (remaining.length > 0) {
    const previous = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const distance = hasCoordinates(previous) && hasCoordinates(candidate)
        ? distanceKm(previous, candidate) : Number.POSITIVE_INFINITY;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  const days: DraftStop[][] = Array.from({ length: Math.max(1, dayCount) }, () => []);
  ordered.forEach((place, index) => {
    const dayIndex = Math.min(days.length - 1, Math.floor(index / PER_DAY[preferences.pace]));
    const day = days[dayIndex];
    const previous = day[day.length - 1];
    const start = previous ? startMinutes(previous.timeEnd) + 30 : startMinutes(preferences.startTime);
    day.push({ place, timeStart: hhmm(start), timeEnd: hhmm(start + VISIT_MINUTES[place.category]) });
  });
  return days.filter((day) => day.length > 0);
}
