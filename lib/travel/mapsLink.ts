// ─────────────────────────────────────────────────────────────────────────────
// Pure parsing of a resolved Google Maps URL into coordinates + a name.
//
// No network access here. The caller (app/api/travel/maps-link/route.ts)
// resolves a short link's redirect chain server-side, then hands the final
// URL to parseGoogleMapsUrl — this file only ever reads URL structure.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedMapsLink {
  lat: number;
  lng: number;
  name: string | null;
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

function inRange(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** The "/place/{name}/" path segment, URL-decoded with dashes/plusses as spaces. */
function extractName(pathname: string): string | null {
  const match = pathname.match(/\/place\/([^/]+)/);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1].replace(/\+/g, ' '));
  } catch {
    return null;
  }
  const name = decoded.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return name || null;
}

/**
 * Extracts coordinates from URL structure only — the "@lat,lng,zoom" segment,
 * a "!3d{lat}!4d{lng}" pair, or a "q=lat,lng" query param — plus an optional
 * name from a "/place/{name}/" path segment. Never throws; returns null for
 * anything it cannot confidently parse.
 */
export function parseGoogleMapsUrl(resolvedUrl: string): ParsedMapsLink | null {
  let url: URL;
  try {
    url = new URL(resolvedUrl);
  } catch {
    return null;
  }

  const name = extractName(url.pathname);

  // "!3d{lat}!4d{lng}" — the precise pin location Google embeds for a
  // specific place, distinct from the "@" segment which is just map center.
  const bang = resolvedUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) {
    const lat = Number(bang[1]);
    const lng = Number(bang[2]);
    if (inRange(lat, lng)) return { lat, lng, name };
  }

  // "@lat,lng,zoom" segment in the path.
  const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (inRange(lat, lng)) return { lat, lng, name };
  }

  // "q=lat,lng" query param.
  const q = url.searchParams.get('q');
  if (q) {
    const match = q.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (inRange(lat, lng)) return { lat, lng, name };
    }
  }

  return null;
}
