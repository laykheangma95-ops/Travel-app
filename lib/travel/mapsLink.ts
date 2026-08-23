// ─────────────────────────────────────────────────────────────────────────────
// Reading a place out of a Google Maps URL.
//
// A traveler standing in front of a hotel does not know its latitude. They do
// have a "Share" button in Google Maps. This module turns what that button
// produces into the lat/lng the itinerary already accepts.
//
// STRUCTURE ONLY — deliberately.
//   Everything here comes out of the URL string itself. This module never
//   fetches, never reads page HTML, and has no network access of any kind, so
//   it is pure, instant, testable, and impossible to turn into a scraper by
//   accident. Resolving a short link into a long one needs a real HTTP
//   request; that is the resolver route's job, and it hands the final URL here.
//
// Client-safe: no imports, no secrets, no server-only dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export interface MapsLinkPlace {
  lat: number;
  lng: number;
  /** From the /place/{name}/ path segment. Null when the URL carries no name. */
  name: string | null;
}

/** Google writes plenty of digits; anything outside the globe is not a place. */
function validCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * `!3d{lat}!4d{lng}` — the *place* pin.
 *
 * Tried before `@`, because `@` is the viewport centre: on a URL that carries
 * both, `@` is where the camera sat and `!3d/!4d` is where the place actually
 * is. They can differ by a block or more.
 */
function fromDataParameter(url: string): { lat: number; lng: number } | null {
  const match = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return validCoordinate(lat, lng) ? { lat, lng } : null;
}

/** `/@{lat},{lng},{zoom}z` — the viewport centre. */
function fromAtSegment(pathname: string): { lat: number; lng: number } | null {
  const match = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$|\/)/.exec(pathname);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return validCoordinate(lat, lng) ? { lat, lng } : null;
}

/** `?q={lat},{lng}` — what "share these coordinates" produces. */
function fromQueryParam(params: URLSearchParams): { lat: number; lng: number } | null {
  for (const key of ['q', 'query', 'center']) {
    const raw = params.get(key);
    if (!raw) continue;
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (validCoordinate(lat, lng)) return { lat, lng };
  }
  return null;
}

/**
 * The human-readable name Google puts in the path: `/maps/place/Wat+Pho/@...`.
 *
 * Percent-decoded, with the `+` and `-` word separators turned back into
 * spaces. Returns null rather than a placeholder when the segment is absent,
 * empty, or is one of Google's own non-names.
 */
function placeName(pathname: string): string | null {
  const match = /\/place\/([^/@]+)/.exec(pathname);
  if (!match) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    // A lone `%` makes decodeURIComponent throw. The raw segment is still
    // better than nothing, and this function must never throw.
    decoded = match[1];
  }

  const name = decoded.replace(/[+\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  // Google uses this literal segment for a dropped pin with no name.
  if (/^unnamed road$/i.test(name)) return null;
  return name;
}

/**
 * A resolved Google Maps URL → the place it points at, or null.
 *
 * Null means "this URL does not carry coordinates" — a normal outcome, not an
 * error. Callers fall back to the manual form. This function never throws, for
 * any input, including non-strings from untyped callers.
 */
export function parseGoogleMapsUrl(resolvedUrl: string): MapsLinkPlace | null {
  if (typeof resolvedUrl !== 'string' || resolvedUrl.trim() === '') return null;

  let url: URL;
  try {
    url = new URL(resolvedUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const coordinates =
    fromDataParameter(resolvedUrl) ??
    fromAtSegment(url.pathname) ??
    fromQueryParam(url.searchParams);
  if (!coordinates) return null;

  return { lat: coordinates.lat, lng: coordinates.lng, name: placeName(url.pathname) };
}

/**
 * The first http(s) link inside a blob of shared text, or null.
 *
 * The OS share sheet hands an item over as a `url`, as `text`, or as both.
 * Google Maps on Android shares the place name and the link together as one
 * text blob, so reading only `url` would receive nothing in the most common
 * case this exists for.
 */
export function firstUrlIn(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/);
  return match ? match[0] : null;
}
