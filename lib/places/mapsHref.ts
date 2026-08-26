// ─────────────────────────────────────────────────────────────────────────────
// placeMapsHref — the one gate a place's coordinates must pass before they may
// become a clickable "Open in maps" link.
//
// WHY THIS SHAPE: lib/travel/mapsLink.ts already reads a Google Maps share URL
// apart to recover lat/lng (`?q={lat},{lng}` is the format Google's own
// "Share" button produces for a bare pin). This is that convention run in
// reverse — Google's documented, key-free "Maps URLs" search endpoint
// (`/maps/search/?api=1&query=`) — rather than a second provider, an embedded
// SDK, or anything that needs a key. No network call, no dependency: a plain
// string built from two numbers.
//
// Pure, no DOM: testable without rendering the page, same as
// lib/places/safeLink.ts's safeWebsiteHref.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a coordinate pair is a real, usable location.
 *
 * Three gates: both values must be finite numbers (`NaN`, `Infinity`, `1/0`
 * fail this), both must fall on the actual globe (matches
 * lib/travel/mapsLink.ts's own `validCoordinate`), and the pair must not be
 * `(0, 0)` — the "no map pin" null-island sentinel `insertPlace()` substitutes
 * for a place with no geocoded location (lib/travel/placeImport.ts, and the
 * same guard Phase 7's registry resolution uses). `(0, 0)` is never a real
 * saved place; treating it as one would send a traveler to a spot in the Gulf
 * of Guinea for every place that was never actually located.
 */
function isRealCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * A safe "Open in maps" href for a place's coordinates, or null when there is
 * none to offer.
 *
 * `lat`/`lng` are coerced through `Number(...)` before anything else runs, so
 * a caller passing a value that merely looks numeric (a string, `null`,
 * `undefined`) is refused the same way an actually malformed one is — the
 * href is always built from two verified finite numbers, never from
 * interpolating whatever was handed in.
 */
export function placeMapsHref(lat: unknown, lng: unknown): string | null {
  // Number(null) is 0 and Number('') is 0 — coercing those would turn a
  // genuinely missing coordinate into a plausible-looking equator point
  // instead of refusing it. Only a value already shaped like a number
  // (a number, or a non-blank string) is coerced at all.
  if (typeof lat !== 'number' && typeof lat !== 'string') return null;
  if (typeof lng !== 'number' && typeof lng !== 'string') return null;
  if (typeof lat === 'string' && lat.trim() === '') return null;
  if (typeof lng === 'string' && lng.trim() === '') return null;

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!isRealCoordinate(latNum, lngNum)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${latNum},${lngNum}`;
}
