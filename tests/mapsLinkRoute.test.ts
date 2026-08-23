// ─────────────────────────────────────────────────────────────────────────────
// The maps-link resolver route — the SSRF guard, specifically.
//
// WHY THIS EXISTS:
//   tests/mapsLink.test.ts covers the parser, which is pure and harmless. This
//   file covers the part that is neither: an endpoint that takes a URL from a
//   user and asks our server to fetch it. Without the hostname allowlist that
//   is a server-side request forgery hole — anyone could point it at an
//   internal address, a cloud metadata endpoint, or a service only reachable
//   from our egress IP, and read the result through us.
//
//   The guard is four lines of code and nothing outside this file proves it is
//   still there. A refactor that "simplified" assertAllowedHost away would
//   leave every other test green.
//
// WHAT IS ASSERTED, AND WHY IT IS ASSERTED THIS WAY:
//   Rejection is proved by spying on global fetch and asserting it was NEVER
//   CALLED. A 400 alone would not be enough — the danger is the request going
//   out, not the status coming back, and a guard placed after the fetch would
//   still return 400 while having already leaked.
//
// WHAT THIS CANNOT COVER:
//   A real network round-trip to Google. This environment has no egress to
//   google.com, so the redirect chain is mocked. The shapes used below are the
//   real ones documented in lib/travel/mapsLink.ts; a live link still deserves
//   one manual check before this ships.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: 'traveler-1' }),
}));

const { POST } = await import('@/app/api/travel/maps-link/route');

/** Fails the test if the route reaches the network at all. */
function forbidFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('fetch was called for a host that must have been rejected');
  });
}

function redirectTo(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

function post(url: unknown) {
  const request = new Request('https://domner.test/api/travel/maps-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ url }),
  });
  return POST(request);
}

beforeEach(() => {
  __resetRateLimits();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SSRF guard — rejects before any network call', () => {
  // Each of these is a way in, and each must be closed before fetch happens.
  const blocked: [name: string, url: string][] = [
    ['an unrelated public host', 'https://evil.example.com/collect'],
    ['localhost', 'http://localhost/'],
    ['loopback by IP', 'http://127.0.0.1:8080/admin'],
    ['the cloud metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
    ['a private RFC1918 address', 'http://10.0.0.5/internal'],
    // The allowlist is an exact hostname set, not a substring match. Each of
    // these contains "google.com" and none of them IS google.com.
    ['a lookalike subdomain', 'https://google.com.evil.example/maps'],
    ['a userinfo-prefixed host', 'https://google.com@evil.example/maps'],
    ['google.com only in the path', 'https://evil.example/google.com/maps'],
    // A different Google property is still not a maps host we asked for.
    ['an unlisted Google host', 'https://accounts.google.com/o/oauth2/auth'],
    ['a non-http scheme', 'file:///etc/passwd'],
  ];

  for (const [name, url] of blocked) {
    it(`rejects ${name} without calling fetch`, async () => {
      const fetchSpy = forbidFetch();
      const response = await post(url);

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'BAD_REQUEST' },
      });
    });
  }

  it('rejects a malformed body without calling fetch', async () => {
    const fetchSpy = forbidFetch();
    expect((await post(42)).status).toBe(400);
    expect((await post('')).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('redirect chain', () => {
  it('re-validates every hop and refuses one that leaves the allowlist', async () => {
    // The first hop is legitimate; the redirect target is not. The point of
    // the test is that the second fetch never happens.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('https://evil.example.com/pwn'));

    const response = await post('https://maps.app.goo.gl/abc123');

    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses a relative redirect that resolves off the allowlist', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('//evil.example.com/pwn'));

    const response = await post('https://maps.app.goo.gl/abc123');

    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('follows an allowed short link through to the resolved place', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        redirectTo('https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/data=!3m1!4b1')
      )
      .mockResolvedValueOnce(new Response('<html>ignored</html>', { status: 200 }));

    const response = await post('https://maps.app.goo.gl/abc123');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe('Wat Pho');
    expect(body.lat).toBeCloseTo(13.7465);
    expect(body.lng).toBeCloseTo(100.4927);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops after five redirects rather than looping', async () => {
    // Always redirect, always to an allowed host: only the hop cap can end it.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => redirectTo('https://www.google.com/maps/next'));

    const response = await post('https://maps.app.goo.gl/abc123');

    expect(response.status).toBe(400);
    // Five redirects followed, so at most six requests are ever made.
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('never follows a redirect automatically', async () => {
    // redirect: 'manual' is what makes per-hop validation possible at all. If
    // this were 'follow', fetch would chase the chain itself and the guard
    // would only ever see the first URL.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await post('https://maps.google.com/maps?q=11.5564,104.9282');

    const init = fetchSpy.mock.calls[0][1];
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeDefined();
  });
});

describe('reading the resolved link', () => {
  it('reports a clear error when the final URL carries no coordinates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await post('https://www.google.com/maps/search/coffee');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/could not read a location/i);
  });

  it('surfaces a network failure as unavailable rather than a crash', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const response = await post('https://maps.app.goo.gl/abc123');

    expect(response.status).toBe(503);
  });

  it('accepts every host on the allowlist', async () => {
    for (const host of ['maps.app.goo.gl', 'www.google.com', 'google.com', 'maps.google.com']) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      __resetRateLimits();

      const response = await post(`https://${host}/maps?q=11.5564,104.9282`);

      expect(response.status, `${host} should be allowed`).toBe(200);
    }
  });
});
