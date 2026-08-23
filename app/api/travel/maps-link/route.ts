import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

// SSRF guard. Only Google's own maps hosts may be fetched — anything else
// (an internal address, a redirect to one, an unrelated site) is rejected
// before a single network call is made.
const ALLOWED_HOSTS = new Set(['maps.app.goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5000;

function assertAllowedHost(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError('BAD_REQUEST', 'That does not look like a link.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError('BAD_REQUEST', 'Only Google Maps links are supported.');
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new ApiError('BAD_REQUEST', 'Only Google Maps links are supported.');
  }
  return url;
}

/**
 * Follows redirects by hand (rather than fetch's automatic `redirect: "follow"`)
 * so every hop's Location header can be re-validated against the same
 * allowlist before it is fetched — a redirect off Google's hosts must stop
 * here, not be silently followed.
 */
async function resolveFinalUrl(startUrl: string): Promise<string> {
  let current = assertAllowedHost(startUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Domner-Itinerary/1.0' },
      });
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Could not reach that link right now.');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new ApiError('BAD_REQUEST', 'Could not read that link.');
      const next = new URL(location, current);
      current = assertAllowedHost(next.toString());
      continue;
    }

    return current.toString();
  }

  throw new ApiError('BAD_REQUEST', 'That link redirected too many times.');
}

export const POST = route(async (request) => {
  await requireUser(request);
  const parsed = requestSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) throw new ApiError('BAD_REQUEST', 'That link is not valid.');

  // Validated again inside resolveFinalUrl at every hop; checked here too so
  // an invalid host is rejected before any other work happens.
  assertAllowedHost(parsed.data.url);

  const finalUrl = await resolveFinalUrl(parsed.data.url);
  const result = parseGoogleMapsUrl(finalUrl);
  if (!result) {
    throw new ApiError('BAD_REQUEST', 'Could not read a location from that link.');
  }

  return ok(result);
}, { rateLimit: 'auth', name: 'travel.maps_link.resolve' });
