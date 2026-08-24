// ─────────────────────────────────────────────────────────────────────────────
// Turning "the same post" into "the same key".
//
// WHY THIS EXISTS:
//   Two travelers who share the same reel do not paste the same string. One has
//   `?igsh=…` on the end, one copied the mobile host, one has a trailing slash,
//   one has the query parameters in a different order. All four are the same
//   post, and paying for four model calls to learn that is the single easiest
//   cost saving in the importer.
//
// STRUCTURE ONLY, like lib/travel/socialLink.ts. Nothing here fetches, and
// nothing here can be made to fetch. A hash is a pure function of a string, so
// it is instant, testable without a network, and impossible to turn into an
// SSRF hole. `node:crypto` is the only import and it is in Node's standard
// library — no dependency is added for this.
//
// WHAT THE HASH IS NOT:
//   Not a secret, and not a security boundary. It is a cache key. It is stored
//   next to the normalized URL it was computed from, so nothing depends on it
//   being irreversible. SHA-256 is used because it is the boring choice.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { classifyLink, firstUrlIn } from './socialLink';

/** Host prefixes that never change which post a URL points at. */
const NOISE_SUBDOMAINS = ['www.', 'm.', 'mobile.'];

/**
 * The form of a URL that two people sharing one post will agree on.
 *
 * Built on top of `classifyLink`, which already strips tracking parameters and
 * the fragment — the privacy-relevant half. This adds only the boring
 * differences: host case, the `www.`/`m.` prefix, a trailing slash, and query
 * parameter order.
 *
 * Returns null for anything that is not a URL, which is not a failure: a
 * traveler who pastes caption text has no link to key on, and that import is
 * recorded without a hash rather than being refused.
 */
export function normalizeForHash(input: string): string | null {
  const link = firstUrlIn(input);
  if (!link) return null;

  const classified = classifyLink(link);
  if (!classified) return null;

  let url: URL;
  try {
    url = new URL(classified.canonicalUrl);
  } catch {
    return null;
  }

  let host = url.hostname.toLowerCase();
  for (const prefix of NOISE_SUBDOMAINS) {
    if (host.startsWith(prefix)) {
      host = host.slice(prefix.length);
      break;
    }
  }

  // A trailing slash on a path is decoration. On the root it is the path, so
  // it is normalised to "" either way and rebuilt consistently below.
  const path = url.pathname.replace(/\/+$/, '');

  // Order is not meaning. `?a=1&b=2` and `?b=2&a=1` are one post.
  const params = [...url.searchParams.entries()].sort(([a], [b]) =>
    a === b ? 0 : a < b ? -1 : 1
  );
  const query = params.length
    ? `?${params.map(([key, value]) => `${key}=${value}`).join('&')}`
    : '';

  // The scheme is dropped deliberately: http:// and https:// versions of the
  // same post are the same post, and every link we will actually fetch is
  // forced to https by the allowlists elsewhere.
  return `${host}${path}${query}`;
}

/** SHA-256, hex. Stable across processes and deploys — a database key must be. */
export function hashNormalized(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export interface ImportKey {
  /** The comparable form, stored so a hash collision or bug is debuggable. */
  normalizedUrl: string;
  /** SHA-256 of `normalizedUrl`. */
  urlHash: string;
}

/**
 * The reuse key for whatever the traveler pasted, or null when there is none.
 *
 * Null means "record this import but never replay it": free text has no stable
 * identity, and keying on the text itself would make a one-character edit look
 * like a different post while an identical retype looked like the same one.
 */
export function importKeyFor(input: string): ImportKey | null {
  const normalized = normalizeForHash(input);
  if (!normalized) return null;
  return { normalizedUrl: normalized, urlHash: hashNormalized(normalized) };
}
