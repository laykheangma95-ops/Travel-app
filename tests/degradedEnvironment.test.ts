// ─────────────────────────────────────────────────────────────────────────────
// What the travel routes do when the backend is not configured at all.
//
// WHY THIS FILE EXISTS:
//   tests/authFallback.test.ts pinned this property for lib/auth.ts after a
//   real incident: with NEXT_PUBLIC_SUPABASE_ANON_KEY missing on a production
//   deploy, every auth function answered `{ error: null, demo: true }`, callers
//   read `demo` as "success, skip ahead", and a missing variable presented as a
//   working login. The lesson generalises: IN PRODUCTION A MISSING KEY IS AN
//   OUTAGE, NEVER A DISCOUNT.
//
//   That lesson was never applied to the travel write routes. Nothing asserted
//   what /api/travel/places/save or /api/travel/maps-link do on an empty .env,
//   which is exactly the state CLAUDE.md §11 requires the app to survive ("the
//   app must run with an empty .env") and exactly the state a fresh clone, a
//   preview deploy with a missing variable, and this test process are all in.
//
//   It is also the state that hid a real reporting error: a browser walk-through
//   of the save flow could not reach the sign-in prompt, because the route
//   answers 503 before it can answer 401. That is correct behaviour —
//   requireUser needs a Supabase client to validate a token, so the
//   availability check MUST come first — but nothing proved it was deliberate,
//   and nothing would notice if the order flipped.
//
// THE INVARIANT, IN ONE LINE:
//   With no backend configured, a travel route must fail loudly and MUST NEVER
//   return a success envelope. Which failure it picks is secondary; that it
//   never succeeds is the whole point.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';

/**
 * These suites deliberately do NOT mock @/lib/serverAuth or @/lib/supabase.
 * Mocking either one would replace the exact seam under test — the tests that
 * mock requireUser (mapsLinkRoute, savePlaceRoute) prove per-route logic and
 * cannot see this class of failure at all, which is why it went unnoticed.
 */
function jsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  __resetRateLimits();
  // The route wrapper logs the cause for whoever is debugging the deploy; keep
  // it out of the test output, exactly as authFallback.test.ts does.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('with no Supabase configured', () => {
  it('confirms the premise: this process really has no backend', () => {
    // If this ever fails, every assertion below is testing the wrong thing.
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeFalsy();
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeFalsy();
  });

  it('save-a-place refuses, and never reports a save that did not happen', async () => {
    const { POST } = await import('@/app/api/travel/places/save/route');
    const response = await POST(
      jsonPost('https://domner.test/api/travel/places/save', {
        destination: 'Thailand',
        contentSlug: 'thailand:wat-pho',
      })
    );
    const body = await response.json();

    // The failure mode this guards against is a 200 with status:'saved' — a
    // traveler told their place is kept when no database ever saw it.
    expect(response.ok).toBe(false);
    expect(response.status).toBe(503);
    expect(body.status).toBeUndefined();
    expect(body.error?.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('save-a-place checks availability BEFORE auth, because auth needs the client', async () => {
    // Documents the deliberate ordering at route.ts: getSupabase() is checked
    // first, so an unconfigured deploy answers 503 rather than a misleading 401
    // that would tell a signed-out visitor to sign in to fix an outage they
    // cannot fix. Flipping the order would break this.
    const { POST } = await import('@/app/api/travel/places/save/route');
    const response = await POST(
      jsonPost('https://domner.test/api/travel/places/save', {
        destination: 'Thailand',
        contentSlug: 'thailand:wat-pho',
      })
    );
    expect(response.status).toBe(503);
    expect(response.status).not.toBe(401);
  });

  it('save-a-place fails on availability before it validates the body', async () => {
    // A malformed body must not turn an outage into a 400: the operator
    // debugging a broken deploy needs to see the outage, not a red herring.
    const { POST } = await import('@/app/api/travel/places/save/route');
    const response = await POST(
      jsonPost('https://domner.test/api/travel/places/save', { nonsense: true })
    );
    expect(response.status).toBe(503);
  });

  it('the maps-link resolver refuses too, and reaches no network', async () => {
    // It has no getSupabase() guard of its own — it gates on requireUser, which
    // cannot build a session client here — so it lands on 401. Different code,
    // same guarantee: no success, and nothing fetched.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('an unauthenticated caller must never reach the network');
    });

    const { POST } = await import('@/app/api/travel/maps-link/route');
    const response = await POST(
      jsonPost('https://domner.test/api/travel/maps-link', {
        url: 'https://maps.app.goo.gl/abc123',
      })
    );
    const body = await response.json();

    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
    expect(body.lat).toBeUndefined();
    expect(body.lng).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the SSRF allowlist still runs first, even with no backend', async () => {
    // Belt and braces: an unconfigured deploy must not become an open proxy
    // just because the auth layer is degraded. A blocked host is refused
    // without a fetch whether or not anyone is signed in.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('a blocked host must never be fetched');
    });

    const { POST } = await import('@/app/api/travel/maps-link/route');
    const response = await POST(
      jsonPost('https://domner.test/api/travel/maps-link', { url: 'http://169.254.169.254/' })
    );

    expect(response.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the itinerary read refuses rather than serving an empty trip', async () => {
    // An empty 200 here would render as "this trip has no places" — the same
    // shape as a real, empty itinerary, and indistinguishable from data loss.
    const { GET } = await import('@/app/api/travel/itinerary/[tripId]/route');
    const response = await GET(
      new Request('https://domner.test/api/travel/itinerary/x', {
        headers: { 'x-forwarded-for': '198.51.100.7' },
      }),
      { params: { tripId: '11111111-1111-4111-8111-111111111111' } }
    );
    const body = await response.json();

    expect(response.ok).toBe(false);
    expect(body.days).toBeUndefined();
    expect(body.trip).toBeUndefined();
  });

  it('every refusal is a JSON envelope a fetch() caller can read', async () => {
    // The client does `await response.json()` and reads error.message. An HTML
    // error page here would surface as an unhandled JSON parse error and a
    // blank screen instead of a message the traveler can act on.
    const { POST } = await import('@/app/api/travel/places/save/route');
    const response = await POST(
      jsonPost('https://domner.test/api/travel/places/save', {
        destination: 'Thailand',
        contentSlug: 'thailand:wat-pho',
      })
    );

    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    const body = await response.json();
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
    // Customer-safe: no stack traces, no connection strings, no key names.
    expect(body.error.message).not.toMatch(/supabase|env|key|undefined|null/i);
  });
});
