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
import { countries } from '@/data/countries';

/**
 * Country NAME (as `trip_plans.destination` and every candidate's `country`
 * field already store it) → ISO alpha-2, lower-cased for a case-insensitive
 * compare against Nominatim's own `address.country_code`. Built once from
 * data/countries.ts (🔒 read-only here — nothing in this file writes to it),
 * the same list the phone-country picker already uses, so this needs no
 * second source of country names to keep in sync.
 */
const COUNTRY_CODE_BY_NAME = new Map(countries.map((c) => [c.name.toLowerCase(), c.code.toLowerCase()]));

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
/** Candidates asked for PER lookup, in the one request that lookup already
 *  makes — this does not add a second network call or touch the
 *  once-per-import cap above; it only widens what one call asks for. */
const RESULT_LIMIT = 5;

export interface GeocodeHit {
  lat: number;
  lng: number;
  /** Nominatim's own name for what it matched. Useful for telling a miss. */
  displayName: string;
  /**
   * How many candidates Nominatim returned for this query, capped at
   * RESULT_LIMIT. 1 means the geocoder itself saw no competing answer; more
   * than 1 is a cheap, free ambiguity signal Phase 13's resolver reads
   * (lib/places/resolutionConfidence.ts) — a query that resolves to several
   * places is weaker evidence than one that resolves to exactly one.
   */
  resultCount: number;
  /**
   * true only when we had an expected country AND every one of the returned
   * candidates disagreed with it. null means "not checked" — either no
   * country was expected, or Nominatim's address details did not include one
   * — and is never coerced into a mismatch. A text country match is evidence,
   * not proof: Nominatim's own address data can be incomplete, so this flags
   * suspicion for the resolver to weigh, it does not reject the hit outright.
   */
  countryMismatch: boolean | null;
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
  // Up to RESULT_LIMIT candidates in this one request — not one request per
  // candidate. This is what lets result count and a same-country pick both
  // exist without a second round-trip or a faster rate of calls.
  url.searchParams.set('limit', String(RESULT_LIMIT));
  // '1' pulls address.country_code onto every result, which is the only way
  // to check a hit's country without a second lookup.
  url.searchParams.set('addressdetails', '1');

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

    const raw = (await response.json()) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const results = raw.slice(0, RESULT_LIMIT) as Record<string, unknown>[];
    const resultCount = results.length;

    // The alpha-2 the caller's country NAME maps to, if it maps to one at
    // all. Unmapped (a spelling this list does not carry) means "unknown",
    // never "mismatch" — see GeocodeHit.countryMismatch.
    const expectedCode = context?.country?.trim()
      ? (COUNTRY_CODE_BY_NAME.get(context.country.trim().toLowerCase()) ?? null)
      : null;

    // Prefer the first result that agrees with the expected country over
    // blindly taking the top-ranked one — this is what stops a wrong-country
    // hit from being accepted just because Nominatim ranked it first. Falling
    // back to the top result when none agree (or nothing was expected) keeps
    // every existing pin-less-otherwise import working exactly as before.
    let chosen: Record<string, unknown> | null = null;
    let countryMismatch: boolean | null = null;
    if (expectedCode) {
      const agreeing = results.find(
        (entry) => String((entry.address as Record<string, unknown> | undefined)?.country_code ?? '').toLowerCase() === expectedCode
      );
      chosen = agreeing ?? results[0];
      const chosenCode = String((chosen.address as Record<string, unknown> | undefined)?.country_code ?? '').toLowerCase();
      countryMismatch = chosenCode ? chosenCode !== expectedCode : null;
    } else {
      chosen = results[0];
    }

    const lat = Number(chosen.lat);
    const lng = Number(chosen.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      displayName: String(chosen.display_name ?? '').slice(0, 300),
      resultCount,
      countryMismatch,
    };
  } catch (error) {
    log.info('geocode.failed', {
      reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
    return null;
  }
}
