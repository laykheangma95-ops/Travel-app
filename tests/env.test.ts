import { afterEach, describe, expect, it, vi } from 'vitest';

// The regression this file exists for: with STRIPE_SECRET_KEY absent, the
// checkout returned a fake "demo" payment intent and the order was written to
// the database with status 'paid'. One missing variable on a production deploy
// turned the whole store into a free vending machine.

async function loadEnv() {
  // The module reads process.env at call time, but isProduction is captured at
  // import, so each case needs a fresh module registry.
  vi.resetModules();
  return import('@/lib/env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('assertConfigured', () => {
  it('returns true when the service is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_example');

    const { assertConfigured } = await loadEnv();
    expect(assertConfigured('stripe')).toBe(true);
  });

  it('allows a demo fallback outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { assertConfigured } = await loadEnv();
    expect(assertConfigured('stripe')).toBe(false);
  });

  it('THROWS in production rather than falling back to demo', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('DOMNER_ALLOW_DEMO', '');

    const { assertConfigured, ConfigurationError } = await loadEnv();
    expect(() => assertConfigured('stripe')).toThrow(ConfigurationError);
  });

  it('names the missing variables on the error', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');

    const { assertConfigured } = await loadEnv();
    try {
      assertConfigured('stripeWebhook');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as { missing: string[] }).missing).toContain('STRIPE_SECRET_KEY');
      expect((error as { missing: string[] }).missing).toContain('STRIPE_WEBHOOK_SECRET');
    }
  });

  it('treats whitespace as unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '   ');

    const { assertConfigured } = await loadEnv();
    expect(() => assertConfigured('stripe')).toThrow();
  });

  it('permits demo in production only with the explicit opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('DOMNER_ALLOW_DEMO', 'true');

    const { assertConfigured } = await loadEnv();
    expect(assertConfigured('stripe')).toBe(false);
  });

  it('does not enable the opt-in for a value other than "true"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('DOMNER_ALLOW_DEMO', '1');

    const { assertConfigured } = await loadEnv();
    expect(() => assertConfigured('stripe')).toThrow();
  });
});

describe('admin allowlist', () => {
  it('fails closed when ADMIN_EMAIL is unset', async () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    const { adminConfigured, adminEmails } = await loadEnv();

    expect(adminConfigured()).toBe(false);
    expect(adminEmails()).toEqual([]);
  });

  it('parses a comma-separated, mixed-case list', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'Ops@Domnerapp.com, founder@domnerapp.com ');
    const { adminEmails } = await loadEnv();

    expect(adminEmails()).toEqual(['ops@domnerapp.com', 'founder@domnerapp.com']);
  });
});

describe('appUrl', () => {
  it('strips a trailing slash', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://domnerapp.com/');
    const { appUrl } = await loadEnv();
    expect(appUrl()).toBe('https://domnerapp.com');
  });
});
