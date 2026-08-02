import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSkuMap, coverageFor, skuFor } from '@/lib/providers/esim/skuMap';
import { HttpEsimProvider } from '@/lib/providers/esim/httpProvider';

// The SKU map is what makes a supplier swap a config change. If it breaks,
// coverage routing silently sends orders to a supplier that cannot fulfil them.

beforeEach(() => {
  __resetSkuMap();
  vi.stubEnv('ESIM_SKU_MAP', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetSkuMap();
});

describe('skuFor', () => {
  it('returns null for a supplier with no mapping', () => {
    expect(skuFor('airalo', 'thailand-standard')).toBeNull();
  });

  it('reads a mapping supplied at runtime', () => {
    vi.stubEnv('ESIM_SKU_MAP', JSON.stringify({ airalo: { 'thailand-standard': 'ARL-TH-7D' } }));
    __resetSkuMap();

    expect(skuFor('airalo', 'thailand-standard')).toBe('ARL-TH-7D');
  });

  it('returns null for a plan the supplier does not carry', () => {
    vi.stubEnv('ESIM_SKU_MAP', JSON.stringify({ airalo: { 'thailand-standard': 'ARL-TH-7D' } }));
    __resetSkuMap();

    expect(skuFor('airalo', 'japan-premium')).toBeNull();
  });

  it('survives a malformed env var instead of taking the site down', () => {
    vi.stubEnv('ESIM_SKU_MAP', '{not valid json');
    __resetSkuMap();

    expect(() => skuFor('airalo', 'thailand-standard')).not.toThrow();
    expect(skuFor('airalo', 'thailand-standard')).toBeNull();
  });

  it('ignores a JSON value of the wrong shape', () => {
    vi.stubEnv('ESIM_SKU_MAP', '["not", "an", "object"]');
    __resetSkuMap();

    expect(skuFor('airalo', 'thailand-standard')).toBeNull();
  });

  it('reports coverage for the admin view', () => {
    vi.stubEnv(
      'ESIM_SKU_MAP',
      JSON.stringify({ airalo: { 'thailand-standard': 'A', 'japan-basic': 'B' } })
    );
    __resetSkuMap();

    expect(coverageFor('airalo')).toEqual(['japan-basic', 'thailand-standard']);
  });
});

describe('HttpEsimProvider coverage gating', () => {
  function build() {
    return new HttpEsimProvider({
      id: 'airalo',
      name: 'Airalo',
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      orderPath: '/orders',
      healthPath: '/packages',
      toOrderBody: (_request, sku) => ({ sku }),
      fromOrderResponse: () => ({
        providerOrderId: 'x',
        iccid: null,
        activationCode: 'LPA:1$x$y',
        qrCodeUrl: null,
        smdpAddress: null,
        installByDate: null,
      }),
    });
  }

  it('does not support a plan with no SKU', () => {
    expect(build().supports('thailand-standard')).toBe(false);
  });

  it('supports a plan once its SKU is mapped', () => {
    vi.stubEnv('ESIM_SKU_MAP', JSON.stringify({ airalo: { 'thailand-standard': 'ARL-TH-7D' } }));
    __resetSkuMap();

    expect(build().supports('thailand-standard')).toBe(true);
  });

  it('is unconfigured without credentials, regardless of SKUs', () => {
    vi.stubEnv('ESIM_SKU_MAP', JSON.stringify({ airalo: { 'thailand-standard': 'ARL-TH-7D' } }));
    __resetSkuMap();

    const provider = new HttpEsimProvider({
      id: 'airalo',
      name: 'Airalo',
      baseUrl: undefined,
      apiKey: undefined,
      orderPath: '/orders',
      healthPath: '/packages',
      toOrderBody: () => ({}),
      fromOrderResponse: () => ({
        providerOrderId: 'x',
        iccid: null,
        activationCode: 'y',
        qrCodeUrl: null,
        smdpAddress: null,
        installByDate: null,
      }),
    });

    expect(provider.isConfigured()).toBe(false);
    expect(provider.supports('thailand-standard')).toBe(false);
  });

  it('reports unconfigured rather than down in a health check', async () => {
    const provider = new HttpEsimProvider({
      id: 'esimgo',
      name: 'eSIM Go',
      baseUrl: undefined,
      apiKey: undefined,
      orderPath: '/orders',
      healthPath: '/health',
      toOrderBody: () => ({}),
      fromOrderResponse: () => ({
        providerOrderId: 'x',
        iccid: null,
        activationCode: 'y',
        qrCodeUrl: null,
        smdpAddress: null,
        installByDate: null,
      }),
    });

    const health = await provider.healthCheck();
    expect(health.state).toBe('unconfigured');
  });
});

describe('ProviderError classification', () => {
  it('treats 5xx as retryable so we fail over', async () => {
    const { ProviderError } = await import('@/lib/providers/esim/types');
    expect(ProviderError.fromStatus('x', 503, '').retryable).toBe(true);
    expect(ProviderError.fromStatus('x', 500, '').retryable).toBe(true);
  });

  it('treats rate limiting and timeouts as retryable', async () => {
    const { ProviderError } = await import('@/lib/providers/esim/types');
    expect(ProviderError.fromStatus('x', 429, '').retryable).toBe(true);
    expect(ProviderError.fromStatus('x', 408, '').retryable).toBe(true);
  });

  it('treats other 4xx as permanent — another supplier will not fix a bad request', async () => {
    const { ProviderError } = await import('@/lib/providers/esim/types');
    expect(ProviderError.fromStatus('x', 400, '').retryable).toBe(false);
    expect(ProviderError.fromStatus('x', 401, '').retryable).toBe(false);
    expect(ProviderError.fromStatus('x', 404, '').retryable).toBe(false);
  });

  it('treats transport failures as retryable', async () => {
    const { ProviderError } = await import('@/lib/providers/esim/types');
    expect(ProviderError.fromTransport('x', new Error('ECONNRESET')).retryable).toBe(true);
  });
});
