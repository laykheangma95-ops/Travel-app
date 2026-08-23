// ─────────────────────────────────────────────────────────────────────────────
// Resolving a pasted Google Maps link.
//
// WHY THIS ROUTE EXISTS AT ALL:
//   A share link like https://maps.app.goo.gl/xxxx carries no coordinates. The
//   coordinates only appear in the long URL it redirects to, and a browser
//   cannot read a cross-origin redirect chain — `fetch` hands back the final
//   body, not the hops. So the redirect has to be followed server-side, and the
//   long URL handed to lib/travel/mapsLink.ts to parse.
//
// WHY IT IS WRITTEN SO DEFENSIVELY:
//   This endpoint takes a URL from a user and makes our server fetch it. That
//   is the textbook shape of an SSRF hole: unguarded, it is a free proxy into
//   anything our egress can reach — cloud metadata at 169.254.169.254, an
//   internal admin panel, a database's HTTP port. The allowlist below is the
//   whole defence, so it is an exact-match set of four hostnames, it is checked
//   BEFORE any network call, and it is re-checked at EVERY redirect hop. A
//   guard that only validates the first URL is not a guard: Google's own
//   shortener would happily 302 us wherever an attacker's own short link
//   pointed.
//
// We never read the page body. Coordinates come from the URL structure only —
// see lib/travel/mapsLink.ts. Nothing here is scraped.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { requireUser } from '@/lib/serverAuth';
import { log } from '@/lib/logger';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The only hostnames this route will ever open a socket to. Exact matches, not
 * suffixes: a `.endsWith('google.com')` test would accept
 * `notgoogle.com` and `google.com.evil.tld`.
 */
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
]);

/** Google's chains are two or three hops. Five is already generous. */
const MAX_REDIRECTS = 5;
/** A hop that has not answered in this long is not going to. */
const HOP_TIMEOUT_MS = 4_000;
/** Whatever the individual hops do, the whole resolve is bounded. */
const TOTAL_TIMEOUT_MS = 8_000;

const payload = z.object({ url: z.string().trim().min(1).max(2_048) }).strict();

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

/**
 * Follows the redirect chain by hand, re-validating every hop.
 *
 * `redirect: 'manual'` rather than `'follow'` is the point of the whole
 * function: letting fetch follow the chain itself would surrender exactly the
 * check this route exists to perform.
 */
export interface ResolvedChain {
  url: URL;
  /** Status of the final, non-redirect response. Lets a caller tell a real
   *  Google page apart from a 403 egress denial or a dead short link. */
  status: number;
}

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
function safeHost(candidate: string): string {
  try {
    return new URL(candidate).hostname;
  } catch {
    return 'unparseable';
  }
}

export const POST = route(async (request, context) => {
  const user = await requireUser(request);

  // The tightest tier we have (10 per 5 minutes), because this is the one
  // endpoint that turns a user's string into an outbound connection.
  //
  // Deliberately namespaced by user id rather than using route()'s rateLimit
  // option: that keys the bucket `auth:<ip>`, the same bucket the sign-in route
  // uses, so pasting map links would have counted against a traveler's ability
  // to sign in. Passing our own identity gives us the `auth` tier's limits in a
  // bucket of our own.
  const verdict = checkRateLimit(request, 'auth', `maps-link:${user.id}`);
  if (!verdict.ok) {
    throw new ApiError('RATE_LIMITED', 'Too many links at once. Please wait a moment.', {
      retryAfterSeconds: verdict.retryAfterSeconds,
      limit: RATE_LIMITS.auth.limit,
    });
  }

  const parsed = payload.safeParse(await readJson<unknown>(request));
  if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Paste a Google Maps link.');

  // ── Nothing above this line has touched the network, and nothing below it
  //    runs unless the hostname is on the allowlist. ────────────────────────
  const start = allowedMapsUrl(parsed.data.url);
  if (!start) {
    log.warn('maps_link.rejected', {
      requestId: context.requestId,
      host: safeHost(parsed.data.url),
    });
    throw new ApiError(
      'BAD_REQUEST',
      'That is not a Google Maps link. Copy the link from the Share button in Google Maps.'
    );
  }

  const chain = await resolveFinalUrl(start, Date.now() + TOTAL_TIMEOUT_MS);
  const place = parseGoogleMapsUrl(chain.url.toString());

  if (!place) {
    // Two very different failures land here and they must not look the same in
    // the log. A traveler pasting a Maps *search* has simply pasted something
    // with no place in it. But a link that Google answered normally and that
    // still yields no coordinates means the URL shape changed under us — that
    // is our bug, it breaks the feature for everyone, and we want to hear about
    // it from telemetry rather than from a traveler. Never log the URL itself.
    log.warn(chain.status < 400 ? 'maps_link.unparsed' : 'maps_link.upstream_error', {
      requestId: context.requestId,
      host: chain.url.hostname,
      status: chain.status,
      expanded: chain.url.toString() !== start.toString(),
    });
    throw new ApiError(
      'BAD_REQUEST',
      'We could not read a location from that link. Try the Share button on the place itself, or fill the form in below.'
    );
  }

  // Coordinates came out of a URL Google did not actually serve us — the link
  // still parsed, so the traveler is fine, but the fetch half is not healthy.
  if (chain.status >= 400) {
    log.warn('maps_link.upstream_error', {
      requestId: context.requestId,
      host: chain.url.hostname,
      status: chain.status,
    });
  }

  return ok({ place }, { requestId: context.requestId });
}, { name: 'travel.maps_link' });
