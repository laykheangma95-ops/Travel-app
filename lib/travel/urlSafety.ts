// ─────────────────────────────────────────────────────────────────────────────
// Is this string a URL we are willing to write down?
//
// STRUCTURE ONLY. Nothing here fetches, nothing here resolves DNS, and nothing
// here can be made to. It is a pure function from a string to a verdict, which
// is what makes every attack below testable without a network.
//
// WHAT THIS IS, AND WHAT IT IS NOT:
//   This is INTAKE validation. It decides whether a link is worth recording.
//   It is NOT the SSRF boundary — that lives in lib/travel/linkPreview.ts and
//   lib/travel/mapsResolve.ts, as an exact-match host allowlist checked before
//   any socket opens and re-checked at every redirect hop.
//
//   The distinction matters and it is easy to get backwards. Phase 3 records
//   links; it does not fetch them. A link passing this module means "we will
//   store this", never "we will request this". Classifying a host and being
//   willing to connect to it are separate decisions, and the second one is
//   always the allowlist's to make.
//
// SO WHY GUARD PRIVATE ADDRESSES AT ALL, IF WE NEVER FETCH?
//   Three reasons. A stored `http://169.254.169.254/latest/meta-data/` is a
//   loaded gun waiting for the day some future connector reads the column and
//   forgets to re-check. It is also a signal: nobody pastes a link to their own
//   loopback by accident. And an intake that accepts them teaches everyone
//   downstream that the column is safe, which is exactly the assumption that
//   turns a fetch added six months from now into an incident.
//
// The IP-literal work below exists because `new URL()` is not a validator. It
// will happily hand back a hostname of `0x7f.1`, `2130706433` or `[::ffff:127.0.0.1]`,
// all of which resolve to loopback and none of which look like `127.0.0.1`.
// ─────────────────────────────────────────────────────────────────────────────

/** A URL longer than this is not a link somebody pasted. */
export const MAX_URL_LENGTH = 2048;

/** Why a URL was refused. One code per distinct thing to tell the traveler. */
export type UrlRejection =
  | 'empty'
  | 'too-long'
  | 'malformed'
  | 'unsupported-protocol'
  | 'credentials-in-url'
  | 'blocked-port'
  | 'private-host';

export type UrlVerdict =
  | { ok: true; url: URL }
  | { ok: false; code: UrlRejection };

/**
 * Hostnames that are never a traveler's holiday reel. Exact matches and suffix
 * rules, because `.localhost` and `.internal` are whole namespaces rather than
 * single names.
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa'];

/**
 * Ports we will record. A social post is served on 80 or 443; a link naming
 * 6379 or 8080 is describing infrastructure, not content.
 */
const ALLOWED_PORTS = new Set(['', '80', '443']);

/**
 * One octet of a dotted address, in any base `inet_aton` would have accepted.
 *
 * This is the part people forget. `127.1`, `0177.0.0.1`, `0x7f.0.0.1` and
 * `2130706433` are all loopback to a resolver, and none of them contains the
 * string "127.0.0.1".
 */
function parseOctet(part: string): number | null {
  if (part === '') return null;

  let value: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = Number.parseInt(part.slice(2), 16);
  else if (/^0[0-7]+$/.test(part)) value = Number.parseInt(part.slice(1), 8);
  else if (/^\d+$/.test(part)) value = Number.parseInt(part, 10);
  else return null;

  return Number.isFinite(value) ? value : null;
}

/**
 * The 32-bit address a hostname denotes, or null when it is not an IPv4
 * literal at all. Handles the one-, two-, three- and four-part forms, each of
 * which `inet_aton` accepts and each of which has been used to walk past a
 * naive `hostname === '127.0.0.1'` check.
 */
export function ipv4FromHostname(hostname: string): number | null {
  const parts = hostname.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const numbers: number[] = [];
  for (const part of parts) {
    const value = parseOctet(part);
    if (value === null) return null;
    numbers.push(value);
  }

  // The trailing part absorbs the remaining octets: `127.1` is 127.0.0.1, and
  // a bare `2130706433` is the whole address.
  const last = numbers[numbers.length - 1];
  const leading = numbers.slice(0, -1);
  const remainingOctets = 4 - leading.length;

  if (leading.some((value) => value > 255)) return null;
  if (last >= 2 ** (8 * remainingOctets)) return null;

  let address = last;
  for (let index = 0; index < leading.length; index += 1) {
    address += leading[index] * 2 ** (8 * (3 - index));
  }

  return address >>> 0;
}

/** Everything an outbound request must never be pointed at. */
function isBlockedIpv4(address: number): boolean {
  const octet = (shift: number) => (address >>> shift) & 0xff;
  const a = octet(24);
  const b = octet(16);

  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, and the metadata service
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved, up to 255.255.255.255
  return false;
}

/**
 * IPv6 literals that must never be reached. `new URL()` gives these back in
 * brackets, normalised and lower-cased, which is the one piece of help it does
 * offer here.
 */
function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.startsWith('[') || !hostname.endsWith(']')) return false;
  const address = hostname.slice(1, -1).toLowerCase();

  if (address === '::1' || address === '::') return true;
  // Unique-local (fc00::/7) and link-local (fe80::/10), which includes the
  // IPv6 form of the metadata service.
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true;

  // An IPv4-mapped or -compatible address wearing an IPv6 costume:
  // ::ffff:127.0.0.1 is loopback however it is spelled.
  const mapped = /^(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/.exec(address);
  if (mapped) {
    const embedded = ipv4FromHostname(mapped[1]);
    return embedded === null || isBlockedIpv4(embedded);
  }
  // The same address written as hex groups: ::ffff:7f00:1.
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(address)) return true;

  return false;
}

/**
 * The verdict on one pasted string.
 *
 * Order matters only for which reason the traveler is told; every check is
 * applied. The reasons are separate codes because "that is not a link" and
 * "we will not open that" need different sentences in front of somebody.
 */
export function parseSafeUrl(candidate: string): UrlVerdict {
  const trimmed = (candidate ?? '').trim();
  if (!trimmed) return { ok: false, code: 'empty' };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, code: 'too-long' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: 'malformed' };
  }

  // http and https only. `javascript:`, `data:`, `file:`, `ftp:` and every
  // other scheme are refused by naming the two we accept rather than by
  // listing the ones we do not — a denylist of schemes is a denylist that a
  // new scheme walks straight past.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, code: 'unsupported-protocol' };
  }

  // `https://user:pass@host/` — credentials in a URL are either a mistake worth
  // refusing or an attempt to make a host look like something it is not.
  if (url.username || url.password) return { ok: false, code: 'credentials-in-url' };

  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, code: 'blocked-port' };

  // NORMALIZE BEFORE COMPARING, and this is the whole of the fix that put it
  // here. `localhost.` is the fully-qualified form of `localhost` and resolves
  // to the same place, but WHATWG `URL` preserves a trailing dot on a name-based
  // host — so an exact-match Set on 'localhost' let it straight through. The
  // asymmetry that hid it: `127.0.0.1.` WAS caught, because the trailing dot is
  // stripped when a host parses as IPv4, so only the name checks were affected.
  //
  // Every hostname rule below — the exact set, the suffix list, the IP parsing
  // — runs on this normalized value, so none of them can be bypassed by a
  // spelling the resolver would ignore.
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!hostname) return { ok: false, code: 'malformed' };

  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, code: 'private-host' };
  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, code: 'private-host' };
  }

  // An IPv6 literal arrives bracketed. It is an address, so the
  // no-dot-means-internal rule below must not be applied to it — that rule
  // refused every public IPv6 host, which is over-blocking rather than
  // security.
  const isIpv6Literal = hostname.startsWith('[') && hostname.endsWith(']');
  if (isIpv6Literal) {
    return isBlockedIpv6(hostname) ? { ok: false, code: 'private-host' } : { ok: true, url };
  }

  const ipv4 = ipv4FromHostname(hostname);
  if (ipv4 !== null && isBlockedIpv4(ipv4)) return { ok: false, code: 'private-host' };

  // A hostname with no dot and no IP form is not a public name: `intranet`,
  // `wiki`, a container name on a shared network. A real post lives on a
  // registered domain.
  if (ipv4 === null && !hostname.includes('.')) return { ok: false, code: 'private-host' };

  return { ok: true, url };
}

/**
 * WHAT THIS MODULE DOES NOT SOLVE, stated so nobody assumes otherwise:
 *
 *   DNS REBINDING. `evil.com` can pass every check here and resolve to
 *   127.0.0.1 a second later. No amount of string inspection fixes that,
 *   because the address is not in the string. The defence is at fetch time —
 *   an exact-match host allowlist, which is what lib/travel/linkPreview.ts and
 *   lib/travel/mapsResolve.ts already do, and which Phase 3 does not widen.
 *
 *   REDIRECT CHAINS. Same answer: a redirect is a fetch-time event, and both
 *   fetchers re-validate every hop with `redirect: 'manual'`.
 *
 * An intake that recorded a link is not a system that requested one.
 */
export const URL_SAFETY_NOTE = 'intake validation only; fetching is guarded separately';
