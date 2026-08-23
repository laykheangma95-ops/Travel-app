import { describe, expect, it, vi } from 'vitest';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';

// The three shapes Google's own Share button produces. Coordinates are read
// out of the URL string; nothing here touches the network, which is the whole
// point of keeping the parser separate from the resolver route.

describe('parseGoogleMapsUrl — the "@lat,lng,zoom" shape', () => {
  it('reads the viewport centre out of a /maps/place/ URL', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/'
    );
    expect(result).toEqual({ lat: 13.7465, lng: 100.4927, name: 'Wat Pho' });
  });

  it('reads an @ segment with no place name', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/@35.6586,139.7454,15z');
    expect(result).toEqual({ lat: 35.6586, lng: 139.7454, name: null });
  });

  it('handles southern and western hemispheres', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/@-33.8568,-151.2153,14z');
    expect(result?.lat).toBe(-33.8568);
    expect(result?.lng).toBe(-151.2153);
  });
});

describe('parseGoogleMapsUrl — the "!3d{lat}!4d{lng}" shape', () => {
  it('reads coordinates out of the data parameter', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/data=!3m1!4b1!4m6!3m5!1s0x30e2992fbb1713c9:0x115a0ea4b3b60c1b!8m2!3d13.7468%21!4d100.4930'
    );
    expect(result?.name).toBe('Wat Pho');
  });

  it('prefers the !3d/!4d place pin over the @ viewport centre', () => {
    // @ is where the camera sat; !3d/!4d is where the place actually is. On a
    // URL carrying both, the pin wins — they can differ by a block or more.
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Tokyo+Tower/@35.6500,139.7400,15z/data=!4m6!3m5!8m2!3d35.6586!4d139.7454'
    );
    expect(result).toEqual({ lat: 35.6586, lng: 139.7454, name: 'Tokyo Tower' });
  });
});

describe('parseGoogleMapsUrl — the "q=lat,lng" shape', () => {
  it('reads a coordinate pair out of the q parameter', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps?q=13.7465,100.4927');
    expect(result).toEqual({ lat: 13.7465, lng: 100.4927, name: null });
  });

  it('tolerates whitespace around the pair', () => {
    const result = parseGoogleMapsUrl('https://maps.google.com/?q=13.7465,%20100.4927');
    expect(result?.lat).toBe(13.7465);
    expect(result?.lng).toBe(100.4927);
  });

  it('ignores a q parameter that is a search term, not coordinates', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps?q=wat+pho+bangkok')).toBeNull();
  });
});

describe('parseGoogleMapsUrl — the place name', () => {
  it('turns plusses into spaces', () => {
    expect(
      parseGoogleMapsUrl('https://www.google.com/maps/place/Grand+Palace/@13.75,100.49,17z')?.name
    ).toBe('Grand Palace');
  });

  it('percent-decodes non-ASCII names', () => {
    expect(
      parseGoogleMapsUrl('https://www.google.com/maps/place/Caf%C3%A9+Amazon/@11.55,104.91,17z')?.name
    ).toBe('Café Amazon');
  });

  it('turns dashes into spaces', () => {
    expect(
      parseGoogleMapsUrl('https://www.google.com/maps/place/Ben-Thanh-Market/@10.77,106.69,17z')?.name
    ).toBe('Ben Thanh Market');
  });

  it('returns null for a name-less dropped pin', () => {
    expect(
      parseGoogleMapsUrl('https://www.google.com/maps/place/Unnamed+Road/@13.75,100.49,17z')?.name
    ).toBeNull();
  });

  it('does not throw on a malformed percent-escape in the name', () => {
    expect(() =>
      parseGoogleMapsUrl('https://www.google.com/maps/place/100%+Coffee/@13.75,100.49,17z')
    ).not.toThrow();
  });
});

describe('parseGoogleMapsUrl — malformed input returns null and never throws', () => {
  const bad: [string, string][] = [
    ['empty string', ''],
    ['whitespace only', '   '],
    ['not a URL at all', 'wat pho bangkok'],
    ['a bare hostname', 'www.google.com/maps'],
    ['a non-http protocol', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>'],
    ['a Google URL with no coordinates', 'https://www.google.com/maps/place/Wat+Pho/'],
    ['non-numeric coordinates', 'https://www.google.com/maps/@abc,def,17z'],
    ['a latitude past the pole', 'https://www.google.com/maps/@999,100.4927,17z'],
    ['a longitude past the date line', 'https://www.google.com/maps/@13.7465,999,17z'],
    ['a half-written pair', 'https://www.google.com/maps?q=13.7465,'],
    ['an unresolved short link', 'https://maps.app.goo.gl/abc123'],
  ];

  for (const [label, input] of bad) {
    it(`returns null for ${label}`, () => {
      expect(() => parseGoogleMapsUrl(input)).not.toThrow();
      expect(parseGoogleMapsUrl(input)).toBeNull();
    });
  }

  it('does not throw when handed a non-string', () => {
    // Untyped callers exist — a JSON body reaches this as `unknown`.
    expect(() => parseGoogleMapsUrl(undefined as unknown as string)).not.toThrow();
    expect(parseGoogleMapsUrl(null as unknown as string)).toBeNull();
    expect(parseGoogleMapsUrl(42 as unknown as string)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The SSRF guard.
//
// This is the part of the feature that matters most. `allowedMapsUrl` is the
// only thing standing between a pasted string and an outbound connection from
// our server, so it is tested here with `fetch` spied on: every case below
// asserts both that the URL was refused AND that no socket was ever opened.
// ─────────────────────────────────────────────────────────────────────────────

describe('allowedMapsUrl — the SSRF allowlist', () => {
  const hostile: [string, string][] = [
    ['loopback by name', 'http://localhost/'],
    ['loopback by address', 'http://127.0.0.1:8080/admin'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['AWS/GCP link-local metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['metadata over https', 'https://169.254.169.254/computeMetadata/v1/'],
    ['private 10/8', 'http://10.0.0.5/internal'],
    ['private 172.16/12', 'http://172.16.0.1/'],
    ['private 192.168/16', 'http://192.168.1.1/'],
    ['an unrelated host', 'https://evil.example.com/'],
    ['a suffix near-miss', 'https://notgoogle.com/maps'],
    ['a subdomain-suffix trick', 'https://google.com.evil.tld/maps'],
    ['a short-link suffix trick', 'https://maps.app.goo.gl.evil.tld/x'],
    ['the userinfo trick', 'https://www.google.com@evil.example/maps'],
    ['an allowlisted host in the fragment only', 'https://evil.example/#https://www.google.com/'],
    ['embedded credentials', 'https://user:pass@www.google.com/maps'],
    ['a non-443 port on an allowed host', 'https://www.google.com:22/maps'],
    ['plain http on an allowed host', 'http://www.google.com/maps'],
    ['the file scheme', 'file:///etc/passwd'],
    ['the ftp scheme', 'ftp://google.com/'],
    ['the gopher scheme (redis SSRF)', 'gopher://127.0.0.1:6379/_INFO'],
    ['the javascript scheme', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,hi'],
    ['not a URL', 'not a url at all'],
    ['an empty string', ''],
  ];

  for (const [label, input] of hostile) {
    it(`refuses ${label}, without opening a connection`, async () => {
      const { allowedMapsUrl } = await import('@/app/api/travel/maps-link/route');
      const spy = vi.spyOn(globalThis, 'fetch');
      expect(allowedMapsUrl(input)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  }

  const permitted = [
    'https://maps.app.goo.gl/abc123',
    'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/',
    'https://google.com/maps?q=13.7,100.4',
    'https://maps.google.com/?q=13.7,100.4',
  ];

  for (const input of permitted) {
    it(`permits ${input}`, async () => {
      const { allowedMapsUrl } = await import('@/app/api/travel/maps-link/route');
      expect(allowedMapsUrl(input)).not.toBeNull();
    });
  }

  it('allows exactly four hostnames and no others', async () => {
    const { allowedMapsUrl } = await import('@/app/api/travel/maps-link/route');
    const hosts = ['maps.app.goo.gl', 'www.google.com', 'google.com', 'maps.google.com'];
    for (const host of hosts) expect(allowedMapsUrl(`https://${host}/maps`)).not.toBeNull();
    // Neighbours of those four that must NOT be reachable.
    for (const host of ['mail.google.com', 'goo.gl', 'app.goo.gl', 'accounts.google.com']) {
      expect(allowedMapsUrl(`https://${host}/`)).toBeNull();
    }
  });
});

describe('resolveFinalUrl — the allowlist is re-checked at every hop', () => {
  function redirectTo(location: string): Response {
    return new Response(null, { status: 302, headers: { location } });
  }

  it('follows a redirect that stays on the allowlist', async () => {
    const { resolveFinalUrl } = await import('@/app/api/travel/maps-link/route');
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://maps.app.goo.gl/')) {
        return redirectTo('https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/');
      }
      return new Response('', { status: 200 });
    });

    const final = await resolveFinalUrl(new URL('https://maps.app.goo.gl/abc123'), Date.now() + 8_000);
    expect(final.url.toString()).toContain('/maps/place/Wat+Pho/@13.7465,100.4927,17z/');
    expect(final.status).toBe(200);
    spy.mockRestore();
  });

  it('refuses a chain that leaves the allowlist mid-way', async () => {
    // The attack the first-URL-only check would miss entirely: an allowlisted
    // shortener that 302s to somewhere it must never take us.
    const { resolveFinalUrl } = await import('@/app/api/travel/maps-link/route');
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      redirectTo('http://169.254.169.254/latest/meta-data/')
    );

    await expect(
      resolveFinalUrl(new URL('https://maps.app.goo.gl/abc123'), Date.now() + 8_000)
    ).rejects.toThrow(/do not follow/);
    // One hop attempted, then refused — the metadata service was never fetched.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('maps.app.goo.gl');
    spy.mockRestore();
  });

  it('refuses a relative redirect that resolves off the allowlist', async () => {
    const { resolveFinalUrl } = await import('@/app/api/travel/maps-link/route');
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      redirectTo('//evil.example/maps')
    );
    await expect(
      resolveFinalUrl(new URL('https://maps.app.goo.gl/abc123'), Date.now() + 8_000)
    ).rejects.toThrow(/do not follow/);
    spy.mockRestore();
  });

  it('gives up rather than following an endless chain', async () => {
    const { resolveFinalUrl } = await import('@/app/api/travel/maps-link/route');
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      redirectTo('https://www.google.com/maps/loop')
    );
    await expect(
      resolveFinalUrl(new URL('https://maps.app.goo.gl/abc123'), Date.now() + 8_000)
    ).rejects.toThrow(/too many times/);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(6);
    spy.mockRestore();
  });
});
