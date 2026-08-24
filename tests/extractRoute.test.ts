// ─────────────────────────────────────────────────────────────────────────────
// The link-importer's read endpoint — the full POST cycle, integration-level.
//
// WHY THIS EXISTS ALONGSIDE the unit suites:
//   tests/socialLink, tests/placeExtraction and tests/linkPreview each prove one
//   pure function. None of them proves the exported POST handler — the thing a
//   real request hits — wires auth, rate limiting, the fallback chain and the
//   response envelope together correctly. ImportPlacesView.tsx reads
//   `body.candidates`, `body.outcome`, `body.destination` and
//   `body.capabilities`, so a change that renamed any of those would break the
//   screen while every unit test stayed green.
//
// THE PROPERTY THAT MATTERS MOST HERE: this endpoint WRITES NOTHING. The whole
// design of the importer rests on extraction being free to be wrong, so a test
// asserts the Supabase client is never even constructed.
//
// The model is deliberately left unconfigured in these tests, so what runs is
// the deterministic floor — which is also the configuration the app ships in
// with an empty .env.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: 'traveler-1' }),
}));

// If the read endpoint ever reaches for the database, this throws rather than
// quietly succeeding.
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('the extract route must never touch the database');
  },
}));

const { POST } = await import('@/app/api/travel/extract/route');

function post(input: string) {
  return POST(
    new Request('https://domner.test/api/travel/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ input }),
    })
  );
}

function html(meta: string) {
  return new Response(`<html><head>${meta}</head><body></body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

beforeEach(() => {
  __resetRateLimits();
  // No key: the deterministic extractor is what runs, and `capabilities.model`
  // must say so rather than the screen implying an intelligence it does not have.
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  // Geocoding off, so no test in this file can reach OpenStreetMap.
  vi.stubEnv('NOMINATIM_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/travel/extract', () => {
  it('reads places out of pasted caption text, with no link and no network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await post(
      ['Bangkok in 2 days', '📍 Wat Pho — go before 9am', '📍 Jodd Fairs Rama 9'].join('\n')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.outcome).toBe('ok');
    expect(body.candidates.map((place: { name: string }) => place.name)).toEqual([
      'Wat Pho',
      'Jodd Fairs Rama 9',
    ]);
    // The country is resolved from the caption, which is what pre-selects the
    // right trip in the picker.
    expect(body.destination).toBe('Thailand');
    expect(body.capabilities.model).toBe(false);
    // Text-only input must not produce an outbound request of any kind.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('turns a Google Maps link into one exact place, without the model', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }) as Response
    );

    const response = await post(
      'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/data=!3m1!4b1!4m2!3m1!1s0x0:0x0!3d13.7465!4d100.4927'
    );
    const body = await response.json();

    expect(body.outcome).toBe('ok');
    expect(body.platform).toBe('google-maps');
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].name).toBe('Wat Pho');
    expect(body.candidates[0].lat).toBeCloseTo(13.7465, 4);
    // Coordinates straight out of Google's own URL — the highest-confidence
    // path there is, and it must arrive pre-ticked.
    expect(body.candidates[0].confidence).toBeGreaterThan(0.9);
    expect(body.candidates[0].source).toBe('maps-link');
  });

  it('reads a caption out of OpenGraph tags when the platform serves them', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      // TikTok's oEmbed is tried first; make it fail so the OG path is proven.
      if (url.includes('/oembed')) return new Response('nope', { status: 403 });
      return html(
        '<meta property="og:title" content="Taipei food" />' +
          '<meta property="og:description" content="1. Din Tai Fung&#10;2. Raohe Night Market" />'
      );
    });

    const response = await post('https://www.tiktok.com/@u/video/7312345678901234567');
    const body = await response.json();

    expect(body.platform).toBe('tiktok');
    expect(body.outcome).toBe('ok');
    expect(body.candidates.map((p: { name: string }) => p.name)).toContain('Din Tai Fung');
  });

  it('says the caption is unavailable — not "no places" — when a platform blocks us', async () => {
    // Instagram's login wall: a 200 with no og tags. The traveler needs to be
    // told to paste the caption, not to try a different post.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(html('') as Response);

    const response = await post('https://www.instagram.com/reel/DbrzTE_NvmD/');
    const body = await response.json();

    expect(body.outcome).toBe('caption-unavailable');
    expect(body.candidates).toEqual([]);
  });

  it('still reads the caption the traveler pasted alongside a blocked link', async () => {
    // The path that makes Instagram usable at all: they copied the whole post.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(html('') as Response);

    const response = await post(
      'https://www.instagram.com/reel/DbrzTE_NvmD/\n📍 Wat Arun\n📍 Grand Palace'
    );
    const body = await response.json();

    expect(body.outcome).toBe('ok');
    expect(body.candidates.map((p: { name: string }) => p.name)).toEqual([
      'Wat Arun',
      'Grand Palace',
    ]);
  });

  it('never opens a socket to a host outside the allowlist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch was called for a host that must have been rejected');
    });

    // A URL shaped like a share but pointing at cloud metadata. The classifier
    // calls it 'web', and nothing in the pipeline fetches a 'web' link.
    const response = await post('http://169.254.169.254/latest/meta-data/');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an empty body without reaching the pipeline', async () => {
    const response = await POST(
      new Request('https://domner.test/api/travel/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ input: '   ' }),
      })
    );
    expect(response.status).toBe(400);
  });

  it('rate limits, in a bucket of its own', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(html('') as Response);
    // The `auth` tier is 10 per 5 minutes.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await post('some caption text')).status).toBe(200);
    }
    expect((await post('some caption text')).status).toBe(429);
  });
});
