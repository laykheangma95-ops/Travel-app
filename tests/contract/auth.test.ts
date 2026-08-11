import { describe, expect, it } from 'vitest';
import { GohubClient } from '@/lib/gohub/client';
import { GohubAuthError } from '@/lib/gohub/errors';
import { BASE_URL, authHeaders } from './helpers';

describe('auth', () => {
  it('returns the exact 401 envelope when the API key is wrong', async () => {
    const response = await fetch(`${BASE_URL}/categories`, {
      headers: { ...authHeaders, 'X-Authorization': 'definitely-not-the-key' },
    });

    expect(response.status).toBe(401);
    // Exactly these two keys, exactly this message. Anything else and our error
    // mapping is reading a shape that does not exist.
    await expect(response.json()).resolves.toEqual({ statusCode: 401, message: 'Unauthorized' });
  });

  it('returns 401 when X-Partner is missing', async () => {
    const { 'X-Partner': _partner, ...withoutPartner } = authHeaders;
    const response = await fetch(`${BASE_URL}/categories`, { headers: withoutPartner });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ statusCode: 401, message: 'Unauthorized' });
  });

  it('surfaces a 401 as GohubAuthError and does not retry it', async () => {
    const client = new GohubClient({ apiKey: 'definitely-not-the-key' });

    const startedAt = Date.now();
    await expect(client.getCategories()).rejects.toBeInstanceOf(GohubAuthError);

    // Three attempts with backoff would take at least 1.5s. A permanent error
    // must fail fast — retrying a bad credential is pure latency.
    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });
});
