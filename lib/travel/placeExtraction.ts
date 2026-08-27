// ─────────────────────────────────────────────────────────────────────────────
// Turning a social-post caption into places a traveler can save.
//
// WHAT THIS IS:
//   The deterministic half of the importer. Given the text of a TikTok /
//   Instagram / Facebook caption — or anything a traveler pastes by hand — it
//   returns the place-shaped things inside it, with a category, a city hint and
//   an honest confidence.
//
// WHY IT EXISTS ALONGSIDE THE MODEL:
//   lib/travel/placeAgent.ts asks Claude the same question and answers it far
//   better. But §11 of CLAUDE.md is explicit that every external service must
//   degrade to a no-op when its env var is missing, and an importer that shows
//   an empty screen without ANTHROPIC_API_KEY would be a feature that only
//   works on a paid plan. So this runs always: it is the floor when the model
//   is unavailable, and it is the validator and normaliser for the model's
//   output when it is. Nothing reaches the database without passing through
//   `normaliseCandidate` here.
//
// PURE — no network, no imports beyond static data, no secrets. Client-safe, so
// the paste box can show a preview of what it found before anything is written.
// ─────────────────────────────────────────────────────────────────────────────

import { tripDestinations } from '@/data/cities';
import type { ItineraryCategory } from './itinerary';
import { PLACE_DESCRIPTION_MAX, PLACE_NAME_MAX } from './itinerary';

/** One thing the importer believes is a place. */
export interface PlaceCandidate {
  /** What the traveler will see on their list. Never empty. */
  name: string;
  /** One line of why it is worth going. May be empty. */
  description: string;
  category: ItineraryCategory;
  /**
   * The city as written in the post, when the post said one. A hint for
   * geocoding and for choosing a trip — never shown as fact.
   */
  city: string | null;
  /**
   * The country this resolves to, matching `trip_plans.destination`. Null when
   * nothing in the post named a place we can resolve; the traveler picks.
   */
  country: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * 0–1. Honest, and used for ordering and for pre-ticking: a traveler should
   * not have to un-tick eight guesses. Everything below `AUTO_SELECT` arrives
   * un-ticked.
   */
  confidence: number;
  /** How this candidate was arrived at. Shown to the traveler, plainly. */
  source: 'maps-link' | 'model' | 'caption';
  /**
   * How many candidates Nominatim itself returned when this pin was geocoded
   * (lib/travel/geocode.ts's GeocodeHit.resultCount). null for a candidate
   * whose pin came straight from a maps-link connector, or that has no pin at
   * all — a geocoder result count means nothing when no geocoder ran.
   * Recorded as evidence, not scored — see ResolutionReasonSignals in
   * lib/places/resolutionConfidence.ts for why counting it on top of the
   * registry's own alternativeCount would charge the same doubt twice.
   */
  geocodeResultCount: number | null;
  /**
   * The geocoder's own verdict on whether the pin it returned is in the
   * country the caption pointed at (lib/travel/geocode.ts's
   * GeocodeHit.countryMismatch). true only when EVERY candidate it returned
   * disagreed; null when nothing was expected, when its address data carried
   * no country, or when no geocoder ran at all — never coerced into a
   * mismatch. This IS scored: lib/places/repository.ts folds it together with
   * the matched canonical row's own country into one combined signal.
   */
  geocodeCountryMismatch: boolean | null;
}

/** At or above this, a candidate is pre-ticked in the review list. */
export const AUTO_SELECT_CONFIDENCE = 0.55;

/** The most places one import will ever produce. A carousel post is ~10. */
export const MAX_CANDIDATES = 25;

/**
 * Lines almost never start with these unless the author is listing a place.
 *
 * 📍 is close to universal; the rest come from the food/travel post shapes this
 * is actually pointed at.
 */
const PIN_MARKERS = /^[\s>*_-]*([📍🏨🍜🍽️🍴☕️☕🛕⛩️🏛️🏖️🗻🎡🛍️🚉🚇✈️🥢🍲🧋🍰🏞️🌸])\s*/u;

/** "1. ", "1) ", "① " — a numbered list is a list of places more often than not. */
const NUMBERED = /^[\s>*_-]*(?:(\d{1,2})[.):、]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/;

/**
 * Category keywords. English first because that is what most captions this
 * product sees are written in; the Khmer and CJK terms are the ones that appear
 * in the posts Cambodian travelers actually forward.
 */
const CATEGORY_WORDS: { category: ItineraryCategory; words: string[] }[] = [
  {
    category: 'food',
    words: [
      'restaurant', 'cafe', 'café', 'coffee', 'eatery', 'noodle', 'ramen', 'sushi',
      'bbq', 'barbecue', 'hotpot', 'hot pot', 'street food', 'night market', 'bakery',
      'dessert', 'brunch', 'bar', 'bistro', 'grill', 'kitchen', 'dining', 'buffet',
      'breakfast', 'lunch', 'dinner', 'snack', 'tea house', 'boba',
      '美食', '餐廳', '咖啡', '小吃', '夜市', '料理', 'អាហារ', 'ភោជនីយដ្ឋាន',
    ],
  },
  {
    category: 'stay',
    words: [
      'hotel', 'hostel', 'resort', 'guesthouse', 'guest house', 'ryokan', 'airbnb',
      'homestay', 'inn', 'lodge', 'suites', 'stay at', '飯店', '酒店', 'សណ្ឋាគារ',
    ],
  },
  {
    category: 'shopping',
    words: [
      'mall', 'market', 'shopping', 'outlet', 'store', 'boutique', 'bazaar',
      'department store', 'souvenir', '百貨', '商場', 'ផ្សារ',
    ],
  },
  {
    category: 'transport',
    words: [
      'airport', 'station', 'terminal', 'metro', 'subway', 'bus stop', 'pier',
      'ferry', 'railway', 'train', '車站', '機場', 'ស្ថានីយ', 'អាកាសយានដ្ឋាន',
    ],
  },
  {
    category: 'spot',
    words: [
      'temple', 'shrine', 'museum', 'park', 'palace', 'beach', 'viewpoint', 'bridge',
      'tower', 'island', 'waterfall', 'garden', 'gallery', 'castle', 'lake',
      'mountain', 'zoo', 'aquarium', 'observatory', 'old town', 'street',
      '寺', '公園', '博物館', 'ប្រាសាទ', 'វត្ត', 'ឆ្នេរ',
    ],
  },
];

/**
 * The category a piece of text reads as, or 'other'.
 *
 * 'other' is a real answer, not a failure — the itinerary treats it as an
 * unlabelled place and shows it perfectly well. Guessing 'spot' for everything
 * would put a hotel under Attractions on the traveler's map legend.
 */
export function inferCategory(text: string): ItineraryCategory {
  const haystack = text.toLowerCase();
  for (const entry of CATEGORY_WORDS) {
    if (entry.words.some((word) => haystack.includes(word))) return entry.category;
  }
  return 'other';
}

// A single index over every city and country name we know, built once. The
// planner's destination list is deliberately the whole world (data/cities.ts),
// not the countries we sell an eSIM for, so a post about Taichung resolves even
// though Taiwan coverage is a separate question.
const DESTINATION_INDEX: { needle: string; label: string; country: string; weight: number }[] =
  tripDestinations
    .flatMap((destination) => {
      const labels = [destination.label, destination.labelKm, ...destination.aliases].filter(
        (label): label is string => typeof label === 'string' && label.length >= 3
      );
      return labels.map((label) => ({
        needle: label.toLowerCase(),
        label: destination.label,
        country: destination.country,
        // A city beats a country on an equal-length match, so "Bangkok" in a
        // caption resolves to Bangkok/Thailand rather than to Thailand alone.
        weight: destination.weight + label.length,
      }));
    })
    .sort((a, b) => b.needle.length - a.needle.length);

export interface DestinationGuess {
  /** The city where one was named, else the country. */
  label: string;
  /** Always a country name — what `trip_plans.destination` stores. */
  country: string;
}

/**
 * The city or country a blob of text is about, or null.
 *
 * Longest match wins, so "Ho Chi Minh City" is not shadowed by a stray "Chi".
 * A word-boundary check keeps "Bali" out of "balcony" — the index holds plenty
 * of short names and a substring search over it produces nonsense.
 */
export function guessDestination(text: string): DestinationGuess | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const haystack = text.toLowerCase();

  let best: { label: string; country: string; weight: number } | null = null;
  for (const entry of DESTINATION_INDEX) {
    const at = haystack.indexOf(entry.needle);
    if (at === -1) continue;
    // Boundary either side: not preceded or followed by a letter/digit. CJK has
    // no spaces, so a CJK needle is accepted wherever it appears.
    const before = haystack[at - 1];
    const after = haystack[at + entry.needle.length];
    const asciiNeedle = /^[\x20-\x7e]+$/.test(entry.needle);
    if (asciiNeedle) {
      if (before && /[a-z0-9]/.test(before)) continue;
      if (after && /[a-z0-9]/.test(after)) continue;
    }
    if (!best || entry.weight > best.weight) {
      best = { label: entry.label, country: entry.country, weight: entry.weight };
    }
  }

  return best ? { label: best.label, country: best.country } : null;
}

/** Trailing/leading punctuation and decoration a caption line collects. */
function tidy(value: string): string {
  return value
    .replace(/[*_`~]+/g, '')
    .replace(/^[\s:：,،.\-–—|•·]+/, '')
    .replace(/[\s:：,،.\-–—|•·]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Emoji and other pictographs, for stripping out of a name. */
const PICTOGRAPHS =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Does this line read like a place name rather than a sentence?
 *
 * The test is deliberately conservative. A false positive puts a fragment of
 * someone's caption on a traveler's map, which is worse than missing one place
 * they can add by hand — the manual form is one tap away in the same sheet.
 */
function looksLikeName(value: string): boolean {
  if (value.length < 2 || value.length > PLACE_NAME_MAX) return false;
  // A sentence has a verb and a full stop; a name does not run to three clauses.
  if (/[.!?]\s+\S/.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length > 9) return false;
  // Pure hashtag or mention lines are topics and handles, not places.
  if (/^[#@]/.test(value)) return false;
  // Something has to be a letter somewhere.
  return /[\p{L}]/u.test(value);
}

interface RawCandidate {
  name: string;
  description: string;
  confidence: number;
}

/**
 * Split a listed line into its name and the note beside it.
 *
 * Caption authors separate the two with an em dash, a pipe, a colon or a
 * newline, in roughly that order of frequency.
 */
function splitNameAndNote(line: string): { name: string; description: string } {
  const separator = /\s+[–—|]\s+|\s+[-]\s+|[:：]\s+/.exec(line);
  if (separator && separator.index > 1) {
    return {
      name: tidy(line.slice(0, separator.index)),
      description: tidy(line.slice(separator.index + separator[0].length)),
    };
  }
  return { name: tidy(line), description: '' };
}

/**
 * Read place-shaped lines out of a caption, without a model.
 *
 * Three shapes, in descending confidence:
 *   📍 Wat Pho — the author explicitly pinned it
 *   1. Wat Pho — the author listed it
 *   Wat Pho     — a short standalone line in a post that is otherwise prose
 *
 * The third is only trusted when the post looks like a list to begin with,
 * because in an ordinary paragraph every short line is a fragment.
 */
export function extractFromCaption(caption: string): PlaceCandidate[] {
  if (typeof caption !== 'string' || !caption.trim()) return [];

  const lines = caption
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const pinned: RawCandidate[] = [];
  const numbered: RawCandidate[] = [];

  for (const line of lines) {
    if (PIN_MARKERS.test(line)) {
      const stripped = tidy(line.replace(PIN_MARKERS, '').replace(PICTOGRAPHS, ' '));
      const { name, description } = splitNameAndNote(stripped);
      if (looksLikeName(name)) pinned.push({ name, description, confidence: 0.72 });
      continue;
    }
    if (NUMBERED.test(line)) {
      const stripped = tidy(line.replace(NUMBERED, '').replace(PICTOGRAPHS, ' '));
      const { name, description } = splitNameAndNote(stripped);
      if (looksLikeName(name)) numbered.push({ name, description, confidence: 0.6 });
    }
  }

  const raw = [...pinned, ...numbered];

  // Neither shape found anything and the post is a run of short lines: treat
  // the short lines as a list. This is the lowest-confidence path and every
  // candidate from it arrives un-ticked.
  if (raw.length === 0) {
    const shortLines = lines.filter(
      (line) => !/^[#@]/.test(line) && looksLikeName(tidy(line.replace(PICTOGRAPHS, ' ')))
    );
    if (shortLines.length >= 2 && shortLines.length >= lines.length / 2) {
      for (const line of shortLines) {
        const { name, description } = splitNameAndNote(tidy(line.replace(PICTOGRAPHS, ' ')));
        if (looksLikeName(name)) raw.push({ name, description, confidence: 0.35 });
      }
    }
  }

  const destination = guessDestination(caption);

  return dedupeCandidates(
    raw.map((entry) =>
      normaliseCandidate(
        {
          name: entry.name,
          description: entry.description,
          category: inferCategory(`${entry.name} ${entry.description}`),
          city: destination?.label ?? null,
          country: destination?.country ?? null,
          lat: null,
          lng: null,
          confidence: entry.confidence,
          source: 'caption',
        },
        destination
      )
    ).filter((entry): entry is PlaceCandidate => entry !== null)
  );
}

/**
 * Force anything claiming to be a candidate into the shape the database will
 * accept, or reject it.
 *
 * This is the ONLY door. Model output, caption output and a Maps link all pass
 * through here, so a hallucinated latitude of 900, a name of 4,000 characters
 * and a category of "brunch spot" are all handled once rather than three times.
 * Returning null means "this is not usable" and the caller drops it silently —
 * a model that returned nine good places and one broken one should not fail the
 * whole import.
 */
export function normaliseCandidate(
  input: Partial<PlaceCandidate> & { name?: unknown },
  fallbackDestination?: DestinationGuess | null
): PlaceCandidate | null {
  const name = tidy(String(input.name ?? '').replace(PICTOGRAPHS, ' ')).slice(0, PLACE_NAME_MAX);
  if (!name || name.length < 2) return null;

  const description = tidy(String(input.description ?? '')).slice(0, PLACE_DESCRIPTION_MAX);

  const category: ItineraryCategory = isCategory(input.category)
    ? input.category
    : inferCategory(`${name} ${description}`);

  const city = typeof input.city === 'string' && input.city.trim() ? tidy(input.city).slice(0, 80) : null;

  // A country the model invented is worse than no country: it decides which
  // trip the place lands on. So it is only accepted when it resolves against
  // the planner's own destination list.
  const claimed = typeof input.country === 'string' ? guessDestination(input.country) : null;
  const fromCity = !claimed && city ? guessDestination(city) : null;
  const country = claimed?.country ?? fromCity?.country ?? fallbackDestination?.country ?? null;

  const lat = validLat(input.lat);
  const lng = validLng(input.lng);

  const confidence =
    typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? Math.min(1, Math.max(0, input.confidence))
      : 0.4;

  return {
    name,
    description,
    category,
    city: city ?? fallbackDestination?.label ?? null,
    country,
    // Coordinates only count as a pair. Half a pin is a pin in the sea.
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
    confidence,
    source: input.source === 'model' || input.source === 'maps-link' ? input.source : 'caption',
    geocodeResultCount:
      typeof input.geocodeResultCount === 'number' && Number.isFinite(input.geocodeResultCount)
        ? input.geocodeResultCount
        : null,
    geocodeCountryMismatch:
      typeof input.geocodeCountryMismatch === 'boolean' ? input.geocodeCountryMismatch : null,
  };
}

function isCategory(value: unknown): value is ItineraryCategory {
  return (
    value === 'spot' ||
    value === 'food' ||
    value === 'shopping' ||
    value === 'transport' ||
    value === 'stay' ||
    value === 'other'
  );
}

function validLat(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90 ? value : null;
}
function validLng(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180 ? value : null;
}

/**
 * One place, once — even when the caption pinned it and then listed it again.
 *
 * Matching is on a folded name: case, spacing and punctuation removed. The
 * survivor is the higher-confidence copy, and it inherits any field the loser
 * had and it lacked, so a pin with coordinates and a list entry with a
 * description merge into one complete place rather than two half ones.
 */
export function dedupeCandidates(candidates: PlaceCandidate[]): PlaceCandidate[] {
  const byKey = new Map<string, PlaceCandidate>();

  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    const [keep, drop] =
      candidate.confidence > existing.confidence ? [candidate, existing] : [existing, candidate];
    byKey.set(key, {
      ...keep,
      description: keep.description || drop.description,
      city: keep.city ?? drop.city,
      country: keep.country ?? drop.country,
      lat: keep.lat ?? drop.lat,
      lng: keep.lng ?? drop.lng,
      category: keep.category === 'other' ? drop.category : keep.category,
    });
  }

  return [...byKey.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}
