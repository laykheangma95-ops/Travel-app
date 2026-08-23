// ─────────────────────────────────────────────────────────────────────────────
// Google Maps link resolution — against the real Google, not a mock.
//
//   npm run test:maps-link
//
// WHY THIS FILE EXISTS SEPARATELY FROM tests/mapsLink.test.ts:
//   The unit suite proves our logic: the parser reads the three URL shapes, and
//   the allowlist refuses everything off it. What no mock can prove is the one
//   thing we do not control — that Google's live redirect chain still ends in a
//   URL shaped the way our parser expects. That needs a real request, so it
//   lives here, out of `npm run verify`, exactly like the GoHub contract suite.
//
// A short link cannot be invented: maps.app.goo.gl/xxxx only exists if Google
// minted it. So the short-link case reads a real one from the environment and
// skips itself, loudly, when there isn't one:
//
//   MAPS_LINK_SHORT_URL="https://maps.app.goo.gl/<from your phone's Share button>" \
//     npm run test:maps-link
//
// Every case also skips when egress to Google is blocked (a sandboxed CI box, a
// restricted network policy) rather than failing — a test that cannot reach its
// subject has proved nothing, and saying so is more useful than going red.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';
import { allowedMapsUrl, resolveFinalUrl } from '@/app/api/travel/maps-link/route';

/** A full /maps/place/ URL is constructible and real — this one loads. */
const FULL_URL =
  process.env.MAPS_LINK_FULL_URL ??
  'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/';

/** A short link is not constructible. Supply a real one or this case skips. */
const SHORT_URL = process.env.MAPS_LINK_SHORT_URL ?? null;

const DEADLINE_MS = 15_000;

/**
 * Can this machine reach Google at all?
 *
 * NOT just "did fetch throw". A policy-enforcing egress proxy answers a blocked
 * host with a real HTTP 403 rather than a connection error, and an earlier
 * version of this probe read that as "reachable" — which made the suite go
 * green having resolved nothing at all. A blocked host is a skip, not a pass,
 * so anything that is not a normal Google answer counts as unreachable.
 */
const reachable = await (async () => {
  try {
    const response = await fetch('https://maps.app.goo.gl/', {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    // Google answers the bare shortener with a redirect or a 200. A 403/407 is
    // the proxy talking, not Google.
    return response.status < 400;
  } catch {
    return false;
  }
})();

describe('maps link — live resolution', () => {
  // Deliberately a FAILING test, not a silent skip. You ran this suite because
  // you wanted to know whether real Google links still resolve; "0 tests ran,
  // all green" answers that question with a lie. Red here means exactly one
  // thing: this machine cannot reach Google, so nothing has been verified.
  it('can reach Google at all', () => {
    expect(
      reachable,
      'Google is unreachable from this machine (blocked egress, offline, or a ' +
        'policy-enforcing proxy answering 403). The live cases below prove ' +
        'nothing until this passes — run the suite somewhere with open egress.'
    ).toBe(true);
  });

  it.skipIf(!reachable)('resolves a full google.com/maps URL to coordinates', async () => {
    const start = allowedMapsUrl(FULL_URL);
    expect(start).not.toBeNull();

    const final = await resolveFinalUrl(start!, Date.now() + DEADLINE_MS);

    // Assert Google actually answered BEFORE looking at coordinates. Without
    // this, a 403 from an egress proxy returns the unexpanded input URL, whose
    // coordinates then parse perfectly and the test passes having proved
    // nothing whatsoever.
    expect(final.status, `Google answered ${final.status}, so nothing was resolved`).toBeLessThan(400);

    const place = parseGoogleMapsUrl(final.url.toString());
    // If this fails, Google changed the URL shape. Print what we actually got
    // rather than guessing at a fix — the parser is the thing to re-read.
    expect(place, `no coordinates in resolved URL: ${final.url.toString()}`).not.toBeNull();
    expect(Math.abs(place!.lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(place!.lng)).toBeLessThanOrEqual(180);
  });

  it.skipIf(!reachable || !SHORT_URL)('resolves a real maps.app.goo.gl short link', async () => {
    const start = allowedMapsUrl(SHORT_URL!);
    expect(start, `${SHORT_URL} is not on the allowlist`).not.toBeNull();

    const final = await resolveFinalUrl(start!, Date.now() + DEADLINE_MS);
    expect(final.status, `Google answered ${final.status}, so nothing was resolved`).toBeLessThan(400);

    // The whole point of the route: the short link must have expanded. A short
    // URL carries no coordinates, so if this is still the input we resolved
    // nothing — and the parse below would fail anyway.
    expect(final.url.toString(), 'short link did not expand').not.toBe(SHORT_URL);
    const place = parseGoogleMapsUrl(final.url.toString());
    expect(place, `short link resolved to ${final.url.toString()} but carried no coordinates`).not.toBeNull();
  });

  it('refuses a real internal address without opening a connection', async () => {
    // The SSRF guard, exercised on a machine that genuinely could reach these.
    for (const hostile of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'https://example.com/',
    ]) {
      expect(allowedMapsUrl(hostile), `${hostile} must never be fetchable`).toBeNull();
    }
  });

  it.skipIf(!reachable)('stays on the allowlist for every hop of a real chain', async () => {
    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new URL(String(input)).hostname);
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      const start = allowedMapsUrl(SHORT_URL ?? FULL_URL)!;
      await resolveFinalUrl(start, Date.now() + DEADLINE_MS);
    } finally {
      globalThis.fetch = realFetch;
    }

    const allowed = ['maps.app.goo.gl', 'www.google.com', 'google.com', 'maps.google.com'];
    for (const host of seen) expect(allowed, `connected to ${host}`).toContain(host);
  });
});
