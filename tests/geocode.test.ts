// ─────────────────────────────────────────────────────────────────────────────
// Phase 13's three free geocoder improvements: displayName retention (already
// there, unchanged), country-bounds checking, and a wider request (up to 5
// candidates) — all in the SAME one request per lookup Nominatim's usage
// policy already bounds. Network never actually reached: fetch is spied on,
// the same pattern tests/mapsLink.test.ts already uses.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodePlace } from '@/lib/travel/geocode';

function nominatimResponse(results: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify(results), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('geocodePlace', () => {
  it('asks for up to 5 candidates and full address details, in ONE request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nominatimResponse([
        { lat: '13.7465', lon: '100.4927', display_name: 'Wat Pho, Bangkok, Thailand', address: { country_code: 'th' } },
      ])
    );

    await geocodePlace('Wat Pho', { country: 'Thailand' });

    expect(spy).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(spy.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('limit')).toBe('5');
    expect(requestedUrl.searchParams.get('addressdetails')).toBe('1');
  });

  it('keeps displayName and reports resultCount', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nominatimResponse([
        { lat: '13.7465', lon: '100.4927', display_name: 'Wat Pho, Bangkok, Thailand', address: { country_code: 'th' } },
        { lat: '13.75', lon: '100.5', display_name: 'Wat Pho (other), Thailand', address: { country_code: 'th' } },
      ])
    );

    const hit = await geocodePlace('Wat Pho', { country: 'Thailand' });

    expect(hit?.displayName).toBe('Wat Pho, Bangkok, Thailand');
    expect(hit?.resultCount).toBe(2);
  });

  it('prefers a same-country candidate over a higher-ranked wrong-country one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nominatimResponse([
        // Ranked first by Nominatim, but the wrong country.
        { lat: '40.0', lon: '-100.0', display_name: 'Wat Pho, Somewhere Else', address: { country_code: 'us' } },
        { lat: '13.7465', lon: '100.4927', display_name: 'Wat Pho, Bangkok, Thailand', address: { country_code: 'th' } },
      ])
    );

    const hit = await geocodePlace('Wat Pho', { country: 'Thailand' });

    expect(hit?.lat).toBeCloseTo(13.7465, 3);
    expect(hit?.countryMismatch).toBe(false);
  });

  it('flags countryMismatch true when every returned candidate disagrees, without rejecting the hit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nominatimResponse([{ lat: '40.0', lon: '-100.0', display_name: 'Wat Pho, USA', address: { country_code: 'us' } }])
    );

    const hit = await geocodePlace('Wat Pho', { country: 'Thailand' });

    expect(hit).not.toBeNull();
    expect(hit?.countryMismatch).toBe(true);
  });

  it('leaves countryMismatch null when no country was expected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nominatimResponse([{ lat: '13.7465', lon: '100.4927', display_name: 'Wat Pho', address: { country_code: 'th' } }])
    );

    const hit = await geocodePlace('Wat Pho');

    expect(hit?.countryMismatch).toBeNull();
  });

  it('leaves countryMismatch null when the expected country name is not in our list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nominatimResponse([{ lat: '13.7465', lon: '100.4927', display_name: 'Wat Pho', address: { country_code: 'th' } }])
    );

    const hit = await geocodePlace('Wat Pho', { country: 'Not A Real Country' });

    expect(hit?.countryMismatch).toBeNull();
  });
});
