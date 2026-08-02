import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The regression this file exists for: verifyAbaWebhook called
// crypto.timingSafeEqual on buffers that could differ in length, which THROWS a
// RangeError instead of returning false. A malformed callback produced an
// unhandled 500 rather than a clean rejection.

const SECRET = 'test-aba-webhook-secret';

async function loadAba() {
  vi.resetModules();
  return import('@/lib/aba');
}

function signedBody(fields: Record<string, string>): Record<string, string> {
  const payload = Object.keys(fields)
    .sort()
    .map((key) => fields[key])
    .join('');
  const hash = crypto.createHmac('sha512', SECRET).update(payload).digest('base64');
  return { ...fields, hash };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ABA_WEBHOOK_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('verifyAbaWebhook', () => {
  it('accepts a correctly signed callback', async () => {
    const { verifyAbaWebhook } = await loadAba();
    const body = signedBody({ tran_id: 'DN-2026-4821', status: '00', apv: '123456' });

    expect(verifyAbaWebhook(body)).toBe(true);
  });

  it('rejects a tampered amount without throwing', async () => {
    const { verifyAbaWebhook } = await loadAba();
    const body = signedBody({ tran_id: 'DN-2026-4821', status: '00' });

    expect(verifyAbaWebhook({ ...body, status: '99' })).toBe(false);
  });

  it('returns false — not a RangeError — for a short hash', async () => {
    const { verifyAbaWebhook } = await loadAba();

    // This is the exact input that used to crash the route with a 500.
    expect(() => verifyAbaWebhook({ tran_id: 'X', status: '00', hash: 'abc' })).not.toThrow();
    expect(verifyAbaWebhook({ tran_id: 'X', status: '00', hash: 'abc' })).toBe(false);
  });

  it('returns false for a missing hash', async () => {
    const { verifyAbaWebhook } = await loadAba();
    expect(verifyAbaWebhook({ tran_id: 'X', status: '00' })).toBe(false);
  });

  it('returns false for a non-string hash', async () => {
    const { verifyAbaWebhook } = await loadAba();
    expect(verifyAbaWebhook({ tran_id: 'X', status: '00', hash: 12345 })).toBe(false);
    expect(verifyAbaWebhook({ tran_id: 'X', status: '00', hash: null })).toBe(false);
  });

  it('returns false for an empty body', async () => {
    const { verifyAbaWebhook } = await loadAba();
    expect(verifyAbaWebhook({})).toBe(false);
  });

  it('rejects everything when the secret is unset in development', async () => {
    vi.stubEnv('ABA_WEBHOOK_SECRET', '');
    const { verifyAbaWebhook } = await loadAba();

    expect(verifyAbaWebhook({ tran_id: 'X', hash: 'anything' })).toBe(false);
  });

  it('throws in production when the secret is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ABA_WEBHOOK_SECRET', '');
    vi.stubEnv('DOMNER_ALLOW_DEMO', '');

    const { verifyAbaWebhook } = await loadAba();

    // Accepting an unverifiable payment callback is worse than a 503.
    expect(() => verifyAbaWebhook({ tran_id: 'X', hash: 'anything' })).toThrow();
  });
});

describe('isAbaPaid', () => {
  it.each([['00', true], [0, true], ['APPROVED', true], ['01', false], ['', false], [null, false]])(
    'status %s → %s',
    async (status, expected) => {
      const { isAbaPaid } = await loadAba();
      expect(isAbaPaid(status)).toBe(expected);
    }
  );
});

describe('createAbaPayment', () => {
  it('throws in production when unconfigured, instead of returning a fake payment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ABA_MERCHANT_ID', '');
    vi.stubEnv('ABA_API_KEY', '');
    vi.stubEnv('DOMNER_ALLOW_DEMO', '');

    const { createAbaPayment } = await loadAba();

    expect(() =>
      createAbaPayment({
        amountUsd: 9.99,
        orderNumber: 'DN-2026-0001',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        customerPhone: '+855120000000',
        returnUrl: 'https://domnerapp.com/order-confirmation/DN-2026-0001',
      })
    ).toThrow();
  });

  it('signs the authoritative amount, formatted to two decimals', async () => {
    vi.stubEnv('ABA_MERCHANT_ID', 'merchant123');
    vi.stubEnv('ABA_API_KEY', 'api-key');

    const { createAbaPayment } = await loadAba();
    const payment = createAbaPayment({
      amountUsd: 9.9,
      orderNumber: 'DN-2026-0001',
      customerName: 'Test',
      customerEmail: 'test@example.com',
      customerPhone: '+855120000000',
      returnUrl: 'https://domnerapp.com/x',
    });

    expect(payment.demo).toBe(false);
    if (!payment.demo) {
      expect(payment.fields.amount).toBe('9.90');
      expect(payment.fields.hash).toBeTruthy();
    }
  });
});
