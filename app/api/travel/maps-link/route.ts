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
// The redirect-following and its SSRF allowlist moved to
// lib/travel/mapsResolve.ts when the link importer became a second caller
// (rule 9). Both functions are re-exported below, unchanged, so every existing
// caller and test keeps working. Read that file for why the allowlist is shaped
// the way it is.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { requireUser } from '@/lib/serverAuth';
import { log } from '@/lib/logger';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';
import { firstUrlIn } from '@/lib/travel/socialLink';
import {
  allowedMapsUrl,
  resolveFinalUrl,
  safeHost,
  TOTAL_TIMEOUT_MS,
} from '@/lib/travel/mapsResolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-exported for the tests and callers that have always imported them here. */
export { allowedMapsUrl, resolveFinalUrl };
export type { ResolvedChain } from '@/lib/travel/mapsResolve';

const payload = z.object({ url: z.string().trim().min(1).max(2_048) }).strict();

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

  // Google Maps on both phones shares the place name and the link as ONE text
  // blob ("Wat Pho\nhttps://maps.app.goo.gl/…"). Pasting that — the most common
  // paste there is — used to fail `new URL()` and come back as "that is not a
  // Google Maps link", which is the bug behind most of the reports about this
  // field. Pull the link out of whatever was pasted first.
  const candidate = allowedMapsUrl(parsed.data.url)
    ? parsed.data.url
    : firstUrlIn(parsed.data.url) ?? parsed.data.url;

  // ── Nothing above this line has touched the network, and nothing below it
  //    runs unless the hostname is on the allowlist. ────────────────────────
  const start = allowedMapsUrl(candidate);
  if (!start) {
    log.warn('maps_link.rejected', {
      requestId: context.requestId,
      host: safeHost(candidate),
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
