// ─────────────────────────────────────────────────────────────────────────────
// The pure primitives the place registry is built on.
//
// STRUCTURE ONLY, like lib/travel/socialLink.ts and lib/travel/urlHash.ts:
// nothing here fetches, nothing here reads the database, and nothing here can
// be made to. Deduplication is arithmetic and string handling, so it is
// instant, testable without a network, and cheap to pin exactly.
//
// TWO OF THESE FUNCTIONS HAVE A TWIN IN SQL.
//   `normalizePlaceName` and `geohashEncode` are also implemented in migration
//   013 as IMMUTABLE functions behind generated columns. The DATABASE's value
//   is the stored one — a row can never carry a key that disagrees with its own
//   name or coordinates. These exist because the application has to compute the
//   same values to look a place UP.
//
//   If the two ever disagree, deduplication silently stops working: a lookup
//   computes one key, the row holds another, nothing matches, and every import
//   creates a duplicate. Nothing about that failure is loud. So
//   tests/places.normalize.test.ts runs both implementations over the same
//   inputs, against a real Postgres, and asserts they agree.
// ─────────────────────────────────────────────────────────────────────────────

/** Base32 for geohashes: no a, i, l or o — the characters that misread aloud. */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Latin letters that carry an accent, and what they fold to. Written out rather
 * than delegated to `String.prototype.normalize('NFD')` for one reason: the SQL
 * twin cannot use NFD without the `unaccent` extension, and a dedupe key that
 * depends on which extensions a database happens to have installed is a key
 * that changes meaning when the database moves.
 *
 * Both strings are kept character-for-character identical to the `translate()`
 * arguments in migration 013.
 */
const ACCENTED = 'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷßæœ';
const FOLDED = 'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyysao';

/** Removed from every name. Character-for-character the SQL twin's set. */
const STRIPPED = new Set([' ', '\t', '\n', '\r', ...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~']);

/**
 * The comparable form of a place name.
 *
 * "Wat Pho", "wat pho", "WAT-PHO" and "Wat  Pho!" are one name. "Wat Phra Kaew"
 * is not. Chinese, Khmer and Thai names keep their characters and lose only
 * case and punctuation — stripping them to the empty string would make every
 * Chinese-named place in one 150m cell collide with every other, which for a
 * product built around a Cambodia-to-China itinerary is not a corner case.
 *
 * Returns '' only for a name with no letters or digits in it at all. The caller
 * must treat '' as "not a usable key" rather than as a match-everything.
 */
export function normalizePlaceName(name: string): string {
  const lowered = (name ?? '').toLowerCase();

  let folded = '';
  for (const character of lowered) {
    const index = ACCENTED.indexOf(character);
    folded += index === -1 ? character : FOLDED[index];
  }

  // Whitespace and ASCII punctuation are removed. EVERYTHING ELSE SURVIVES:
  // Chinese, Khmer, Thai and their combining marks are all part of the name.
  //
  // WHY AN EXPLICIT SET AND NOT \p{L}/\p{N}: those Unicode property escapes
  // disagree with Postgres's [[:alnum:]] about Khmer combining marks —
  // Postgres kept a spacing vowel sign and dropped a coeng, JavaScript dropped
  // both. Two normalizers that disagree by one character produce two keys, and
  // two keys produce a duplicate for every Khmer place anybody ever saves. This
  // set is the same set in both languages, under every collation.
  return [...folded].filter((character) => !STRIPPED.has(character)).join('');
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Standard geohash. Each character narrows the box; 7 characters is roughly
 * 150m × 150m, which is the cell the uniqueness index uses.
 *
 * Transcribed from the same steps as the SQL twin, in the same order, using the
 * same double-precision arithmetic — including the `>=` comparison against the
 * midpoint, which decides which side of a boundary a point falls on.
 */
export function geohashEncode(lat: number, lng: number, chars = 9): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  let isLng = true;
  let bits = 0;
  let accumulator = 0;
  let result = '';

  while (result.length < chars) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        accumulator = accumulator * 2 + 1;
        lngMin = mid;
      } else {
        accumulator *= 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        accumulator = accumulator * 2 + 1;
        latMin = mid;
      } else {
        accumulator *= 2;
        latMax = mid;
      }
    }

    isLng = !isLng;

    if (bits < 4) {
      bits += 1;
    } else {
      result += BASE32[accumulator];
      bits = 0;
      accumulator = 0;
    }
  }

  return result;
}

/** The cell the uniqueness index groups by. Two of these equal ⇒ same ~150m. */
export function identityCell(lat: number, lng: number): string {
  return geohashEncode(lat, lng, 9).slice(0, 7);
}

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Used to decide "is this the same place?", where the honest answer at 40m is
 * yes and at 4km is no. Haversine is accurate to well under a metre at these
 * distances, which is far past what a caption's geocoded guess deserves.
 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * A latitude/longitude box that contains everything within `meters`.
 *
 * WHY A BOX AND NOT A GEOHASH PREFIX:
 *   A geohash cell has edges. Two points thirty metres apart can sit either
 *   side of one and share no prefix at all, so a prefix search would answer
 *   "no nearby places" for a place that is right there. A box has no such
 *   failure, and it is what the (latitude, longitude) index serves.
 *
 * The longitude span widens away from the equator, because a degree of
 * longitude is narrower there. Near the poles the cosine collapses, so it is
 * floored — a slightly-too-wide box costs a few extra rows to measure, while a
 * too-narrow one silently misses the match.
 */
export function boundingBox(center: Coordinates, meters: number): BoundingBox {
  const latDelta = (meters / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosine = Math.max(0.01, Math.cos(toRadians(center.lat)));
  const lngDelta = latDelta / cosine;

  return {
    minLat: Math.max(-90, center.lat - latDelta),
    maxLat: Math.min(90, center.lat + latDelta),
    minLng: Math.max(-180, center.lng - lngDelta),
    maxLng: Math.min(180, center.lng + lngDelta),
  };
}

/**
 * A URL-safe handle for a place, disambiguated by the caller when it collides.
 *
 * Built from the same normalization as the dedupe key, so a slug and an
 * identity never disagree about what a name is.
 */
export function placeSlug(countryName: string, name: string, suffix?: string): string {
  const country = normalizePlaceName(countryName).slice(0, 40) || 'world';
  const place = normalizePlaceName(name).slice(0, 60) || 'place';
  return suffix ? `${country}:${place}-${suffix}` : `${country}:${place}`;
}

/** Same place, or different place? The one judgement call, in one place. */
export const SAME_PLACE_RADIUS_M = 150;

/**
 * How confident we are that two records describe one place, 0–1.
 *
 * Only ever called on candidates that already share a normalized name, so this
 * scores distance alone: touching (1.0) down to the edge of the radius (0.5).
 * Beyond the radius the answer is not "less confident", it is no.
 */
export function proximityConfidence(meters: number): number {
  if (meters >= SAME_PLACE_RADIUS_M) return 0;
  return Number((1 - (meters / SAME_PLACE_RADIUS_M) * 0.5).toFixed(3));
}
