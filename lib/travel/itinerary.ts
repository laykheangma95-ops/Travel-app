export type ItineraryCategory = 'spot' | 'food' | 'shopping' | 'transport' | 'stay' | 'other';

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export interface OpeningWindow { open: string; close: string }
export type OpeningHours = Partial<Record<Weekday, OpeningWindow[]>>;

export interface CuratedPlace {
  id: string;
  name: string;
  category: ItineraryCategory;
  lat: number;
  lng: number;
  description: string;
  photo_url: string | null;
  source: 'editorial' | 'ai_generated';
  /**
   * Null for the editorial catalogue everyone sees, set for a place this
   * traveler added themselves (migration 009). Drives the "Mine" filter in the
   * add-place sheet, which previously claimed to show saved places and in fact
   * filtered to editorial ones — the exact opposite.
   */
  created_by: string | null;
  opening_hours?: OpeningHours | null;
  timezone?: string | null;
  /**
   * The canonical registry row this catalogue row resolved to (migration 013),
   * when it did. Already present on the wire since Phase 7 — Phase 9 is the
   * first reader. Null is common and normal: coordinate-less places, and a
   * traveler's row that lost the resolver's race, never link.
   */
  canonical_place_id: string | null;
}

/**
 * Where the canonical place page for this catalogue row lives, or null when
 * it has none to link to. The only thing a caller needs to know before
 * rendering a "View place" affordance — `/place/[id]` re-derives visibility
 * from RLS on every request regardless of how the id arrived, so this is a
 * navigation target, never a claim that the place is visible to anyone.
 */
export function placeDetailHref(place: Pick<CuratedPlace, 'canonical_place_id'>): string | null {
  return place.canonical_place_id ? `/place/${place.canonical_place_id}` : null;
}

export const PLACE_NAME_MAX = 120;
export const PLACE_DESCRIPTION_MAX = 400;

/** Category labels, bilingual. `km` mirrors `en`, never a subset. */
export const CATEGORY_LABEL: Record<ItineraryCategory, { en: string; km: string }> = {
  spot: { en: 'Attraction', km: 'ទីកន្លែងទស្សនា' },
  food: { en: 'Food', km: 'អាហារ' },
  shopping: { en: 'Shopping', km: 'ទិញទំនិញ' },
  transport: { en: 'Transit', km: 'ការធ្វើដំណើរ' },
  stay: { en: 'Stay', km: 'កន្លែងស្នាក់នៅ' },
  other: { en: 'Place', km: 'ទីតាំង' },
};

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

/**
 * The most days one trip's grid is ever seeded with.
 *
 * A cap rather than a limit on the trip: a traveler on a three-month journey
 * still has a trip, they just do not get ninety day cards written for them
 * before they have planned anything. "Add day" goes past this by hand.
 */
export const MAX_SEEDED_DAYS = 30;

/**
 * How many days a trip covers, inclusive of both ends. Null when the dates are
 * not both known.
 *
 * `cap` exists because two callers want different ceilings for the same number:
 * seeding the grid follows the trip (up to MAX_SEEDED_DAYS), while the smart
 * draft only ever drafts the first week of one.
 */
export function tripDayCount(
  start: string | null,
  end: string | null,
  cap: number = MAX_SEEDED_DAYS
): number | null {
  if (!start || !end) return null;
  const difference = Math.floor(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000
  );
  return Math.min(cap, Math.max(1, difference + 1));
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

export function minutesFromTime(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function openingWindows(place: ItineraryPlace, date: string | null): OpeningWindow[] | null {
  if (!date || !place.place.opening_hours) return null;
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return place.place.opening_hours[weekday] ?? null;
}

export function scheduleWarnings(
  places: ItineraryPlace[], date: string | null, legs: RouteLeg[] = []
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const legByPair = new Map(legs.map((leg) => [`${leg.fromPlaceId}:${leg.toPlaceId}`, leg]));
  places.forEach((place, index) => {
    const start = minutesFromTime(place.time_start);
    const end = minutesFromTime(place.time_end);
    if (start !== null && end !== null && end <= start) {
      warnings.push({ kind: 'invalid-time', placeId: place.id, message: {
        en: 'End time must be after the start time.', km: 'ម៉ោងបញ្ចប់ត្រូវតែក្រោយម៉ោងចាប់ផ្តើម។',
      } });
    }
    const windows = openingWindows(place, date);
    if (windows && start !== null) {
      const visitEnd = end ?? start;
      const fits = windows.some((window) => {
        const opens = minutesFromTime(window.open);
        const closes = minutesFromTime(window.close);
        return opens !== null && closes !== null && start >= opens && visitEnd <= closes;
      });
      if (!fits) warnings.push({ kind: 'closed', placeId: place.id, message: {
        en: `${place.place.name} is outside its saved opening hours.`,
        km: `${place.place.name} ស្ថិតនៅក្រៅម៉ោងបើកដែលបានរក្សាទុក។`,
      } });
    }
    const next = places[index + 1];
    if (!next) return;
    const nextStart = minutesFromTime(next.time_start);
    if (end === null || nextStart === null) return;
    if (nextStart < end) {
      warnings.push({ kind: 'overlap', placeId: next.id, message: {
        en: `${next.place.name} overlaps the previous stop.`,
        km: `${next.place.name} ត្រួតពេលជាមួយចំណតមុន។`,
      } });
      return;
    }
    const leg = legByPair.get(`${place.id}:${next.id}`);
    if (leg && nextStart < end + Math.ceil(leg.durationSeconds / 60)) {
      warnings.push({ kind: 'transfer', placeId: next.id, message: {
        en: `Allow more travel time before ${next.place.name}.`,
        km: `សូមទុកពេលធ្វើដំណើរបន្ថែមមុនទៅ ${next.place.name}។`,
      } });
    }
  });
  return warnings;
}

export interface RouteLeg {
  fromPlaceId: string;
  toPlaceId: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoutedJourney {
  provider: 'osrm';
  profile: 'driving';
  legs: RouteLeg[];
  geometry: [number, number][];
}

export type ScheduleWarningKind = 'invalid-time' | 'overlap' | 'transfer' | 'closed';
export interface ScheduleWarning {
  kind: ScheduleWarningKind;
  placeId: string;
  message: { en: string; km: string };
}
