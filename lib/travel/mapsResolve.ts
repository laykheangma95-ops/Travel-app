// ─────────────────────────────────────────────────────────────────────────────
// Following a Google Maps share link to the URL that actually carries the pin.
//
// MOVED, NOT REWRITTEN. This is the resolver that lived inside
// app/api/travel/maps-link/route.ts, unchanged in behaviour except for the two
// hostnames noted below. It moved here because a second caller now needs it —
// the link importer (app/api/travel/extract) — and rule 9 puts shared logic in
// lib/, not inside a route handler. The route still exports both functions, so
// every existing test and import keeps working.
//
// WHY IT IS WRITTEN SO DEFENSIVELY:
//   This takes a URL from a user and makes our server fetch it. That is the
//   textbook shape of an SSRF hole: unguarded, it is a free proxy into anything
//   our egress can reach — cloud metadata at 169.254.169.254, an internal admin
//   panel, a database's HTTP port. The allowlist below is the whole defence, so
//   it is an exact-match set of hostnames, it is checked BEFORE any network
//   call, and it is re-checked at EVERY redirect hop. A guard that only
//   validates the first URL is not a guard: Google's own shortener would
//   happily 302 us wherever an attacker's own short link pointed.
//
// We never read the page body. Coordinates come from the URL structure only —
// see lib/travel/mapsLink.ts. Nothing here is scraped.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError } from '@/lib/http';
import { log } from '@/lib/logger';

/**
 * The only hostnames this resolver will ever open a socket to. Exact matches,
 * not suffixes: a `.endsWith('google.com')` test would accept `notgoogle.com`
 * and `google.com.evil.tld`.
 *
 * `goo.gl` and `g.co` are the two additions to the original set, and they are
 * the fix for the most common "the Maps link does nothing" report: Google Maps
 * on iOS and the Google search result card both hand out `g.co/kgs/…` and
 * `goo.gl/maps/…`, neither of which was on the list, so both were rejected as
 * "not a Google Maps link". They are generic Google shorteners rather than
 * Maps-only ones, which is safe here for exactly one reason — every hop they
 * redirect to is re-validated against this same list, so a shortener pointing
 * anywhere else is refused at the next hop rather than followed.
 */
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'www.google.com',
  'google.com',
  'maps.google.com',
]);

/** Google's chains are two or three hops. Five is already generous. */
const MAX_REDIRECTS = 5;
/** A hop that has not answered in this long is not going to. */
const HOP_TIMEOUT_MS = 4_000;
/** Whatever the individual hops do, the whole resolve is bounded. */
export const TOTAL_TIMEOUT_MS = 8_000;

/**
 * The SSRF gate. Exported so it can be tested directly, without a network.
 *
 * Returns the parsed URL when it is safe to fetch, or null. Null covers every
 * refusal: a non-URL, a non-https scheme, embedded credentials, and — the one
 * that matters — any hostname outside the allowlist.
 */
export function allowedMapsUrl(candidate: string): URL | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  // https only. An http hop would be a downgrade we have no reason to accept,
  // and every allowlisted host serves https.
  if (url.protocol !== 'https:') return null;

  // `https://www.google.com@evil.example/` parses with hostname `evil.example`,
  // so the allowlist already catches it — but credentials in a URL we are about
  // to fetch have no legitimate use here, so they are refused outright.
  if (url.username || url.password) return null;

  // A non-default port on an allowlisted host is not something Google serves;
  // it is someone trying to reach a service pinned behind that name.
  if (url.port && url.port !== '443') return null;

  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  return url;
}

export interface ResolvedChain {
  url: URL;
  /** Status of the final, non-redirect response. Lets a caller tell a real
   *  Google page apart from a 403 egress denial or a dead short link. */
  status: number;
}

/**
 * Follows the redirect chain by hand, re-validating every hop.
 *
 * `redirect: 'manual'` rather than `'follow'` is the point of the whole
 * function: letting fetch follow the chain itself would surrender exactly the
 * check this module exists to perform.
 */
export async function resolveFinalUrl(start: URL, deadline: number): Promise<ResolvedChain> {
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ApiError('BAD_REQUEST', 'That link took too long to open.');

    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(HOP_TIMEOUT_MS, remaining)),
        headers: {
          // Google serves the short-link redirect to anything, but a browser
          // UA keeps us out of the bot-interstitial path.
          'User-Agent': 'Mozilla/5.0 (compatible; DomnerTravel/1.0)',
          'Accept-Language': 'en',
        },
      });
    } catch {
      // Timeout, DNS failure, connection refused — all the same to the caller.
      throw new ApiError('BAD_REQUEST', 'We could not open that link. Please try again.');
    }

    // Not a redirect: this is the end of the chain, wherever it landed.
    if (response.status < 300 || response.status >= 400) {
      return { url: current, status: response.status };
    }

    const location = response.headers.get('location');
    if (!location) return { url: current, status: response.status };

    // Relative Location headers are legal, so resolve against the current URL
    // before validating — then validate the *result*, which is the only thing
    // we would actually connect to.
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new ApiError('BAD_REQUEST', 'That link redirected somewhere we could not read.');
    }

    const validated = allowedMapsUrl(next);
    if (!validated) {
      // The single most important log line in this file: a chain that tried to
      // walk off the allowlist is either Google changing something or someone
      // probing for an SSRF hole.
      log.warn('maps_link.redirect_off_allowlist', { hop, host: safeHost(next) });
      throw new ApiError('BAD_REQUEST', 'That link points somewhere we do not follow.');
    }

    current = validated;
  }

  throw new ApiError('BAD_REQUEST', 'That link redirected too many times.');
}

/** Hostname only, for logging. Never log the full user-supplied URL. */
export function safeHost(candidate: string): string {
  try {
    return new URL(candidate).hostname;
  } catch {
    return 'unparseable';
  }
}
