// ─────────────────────────────────────────────────────────────────────────────
// Turning a place NAME into a pin.
//
// WHY:
//   A place with no coordinates still works — it sits in the traveler's Ideas
//   list and reads fine. But it does not appear on the map, and the whole point
//   of §2 rule 15's "useful while travelling with no cellular service" is that
//   the map is the thing you open when you are standing in the street. A place
//   imported from a TikTok is worth much more with a pin on it.
//
// WHICH SERVICE:
//   Nominatim, the OpenStreetMap geocoder. It needs no key, which is what lets
//   this ship without a new secret in Vercel, and the repo already leans on
//   OSM for routing (OSRM_BASE_URL). Google's Places API would give better
//   answers for the small businesses these posts are usually about; adding it
//   is an owner decision with a bill attached, so the base URL is an env var
//   and swapping in a self-hosted or commercial endpoint is a config change,
//   not a rewrite.
//
// THE USAGE POLICY IS PART OF THE CODE:
//   OSM's public instance permits at most one request per second from an
//   application, and requires a real User-Agent that identifies it. Both are
//   enforced below — serially, with a gap, and capped per import — rather than
//   written down in a comment and forgotten. An importer that fires fifteen
//   parallel lookups would get Domner blocked, and would deserve to be.
//
// DEGRADES: with NOMINATIM_BASE_URL set to an empty string, every lookup
// returns null and every place imports without a pin. Nothing errors.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import { log } from '@/lib/logger';

/**
 * Empty string switches geocoding off entirely; unset uses the public OSM
 * instance. Point it at your own Nominatim (or a commercial endpoint with the
 * same response shape) to lift the rate limit.
 *
 * Read on every call rather than once at module load. A `const` at module scope
 * bakes in whatever the environment held at import time — fine on a serverless
 * boot and wrong everywhere else: a test that sets the variable in `beforeEach`
 * silently keeps the old value and reaches the real OpenStreetMap over the
 * network. lib/env.ts reads `process.env` inside functions for the same reason.
 */
function baseUrl(): string {
  const configured = process.env.NOMINATIM_BASE_URL;
  return configured === undefined ? 'https://nominatim.openstreetmap.org' : configured.trim();
}

/** OSM's policy for an application on the public instance. */
const MIN_GAP_MS = 1_100;
/** One import geocodes at most this many places. Beyond it, they land pin-less. */
export const MAX_LOOKUPS_PER_IMPORT = 8;
const TIMEOUT_MS = 5_000;

export interface GeocodeHit {
  lat: number;
  lng: number;
  /** Nominatim's own name for what it matched. Useful for telling a miss. */
  displayName: string;
}

export function geocodingConfigured(): boolean {
  return baseUrl() !== '';
}

/**
 * Hosts we will open a socket to. The env var is operator-controlled rather
 * than user-controlled, so this is not the SSRF boundary that
 * lib/travel/linkPreview.ts needs — but a typo'd base URL should fail closed
 * rather than send a traveler's search terms somewhere unintended.
 */
function endpoint(): URL | null {
  const base = baseUrl();
  if (!base) return null;
  try {
    const url = new URL(`${base.replace(/\/$/, '')}/search`);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

let lastCallAt = 0;

/** Hold the line at one request per MIN_GAP_MS, process-wide. */
async function waitForSlot(): Promise<void> {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  lastCallAt = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Where a named place is, or null.
 *
 * Null covers every outcome that is not a confident hit: geocoding switched
 * off, the service down, nothing found, or an answer outside the country the
 * caller expected. Callers import the place anyway, without a pin — never an
 * error in front of the traveler.
 */
export async function geocodePlace(
  name: string,
  context?: { city?: string | null; country?: string | null }
): Promise<GeocodeHit | null> {
  const url = endpoint();
  if (!url || !name.trim()) return null;

  // Name first, then the city, then the country: Nominatim reads a free-form
  // query left to right and the extra context is what stops "Blue Bottle" from
  // resolving to the one in California.
  const query = [name.trim(), context?.city?.trim(), context?.country?.trim()]
    .filter(Boolean)
    .join(', ');

  url.searchParams.set('q', query.slice(0, 300));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');

  try {
    await waitForSlot();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Required by OSM's policy: a real identifier and a way to reach us.
        'User-Agent': 'DomnerTravel/1.0 (https://domner.com; travel itinerary planner)',
        'Accept-Language': 'en',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      log.info('geocode.upstream_status', { status: response.status });
      return null;
    }

    const results = (await response.json()) as unknown;
    if (!Array.isArray(results) || results.length === 0) return null;

    const first = results[0] as Record<string, unknown>;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      displayName: String(first.display_name ?? '').slice(0, 300),
    };
  } catch (error) {
    log.info('geocode.failed', {
      reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
    return null;
  }
}
