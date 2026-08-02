import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __clearProvidersForTest,
  __registerProviderForTest,
  eligibleProviders,
  provisionWithFailover,
  providerStatus,
  resetBreakers,
} from '@/lib/providers/esim/registry';
import { ProviderError } from '@/lib/providers/esim/types';
import type {
  EsimProvider,
  EsimProvisionRequest,
  ProvisionedEsim,
  ProviderHealth,
} from '@/lib/providers/esim/types';

// This suite is the proof that a supplier outage is not our outage. Every case
// here corresponds to something that will actually happen in production:
// a supplier goes down, drops a country, rate-limits us, or returns nonsense.

interface FakeOptions {
  id: string;
  configured?: boolean;
  supportedPlans?: string[] | 'all';
  behavior?: 'succeed' | 'retryable-fail' | 'permanent-fail';
}

function fakeProvider(options: FakeOptions): EsimProvider & { calls: number } {
  const {
    id,
    configured = true,
    supportedPlans = 'all',
    behavior = 'succeed',
  } = options;

  const provider = {
    id,
    name: id,
    calls: 0,
    isConfigured: () => configured,
    supports: (planId: string) =>
      configured && (supportedPlans === 'all' || supportedPlans.includes(planId)),
    async provision(request: EsimProvisionRequest): Promise<ProvisionedEsim> {
      provider.calls += 1;

      if (behavior === 'retryable-fail') {
        throw new ProviderError({
          providerId: id,
          code: 'UPSTREAM_DOWN',
          message: `${id} is down`,
          retryable: true,
        });
      }

      if (behavior === 'permanent-fail') {
        throw new ProviderError({
          providerId: id,
          code: 'BAD_REQUEST',
          message: `${id} rejected the request`,
          retryable: false,
        });
      }

      return {
        providerId: id,
        providerOrderId: `${id}-order-1`,
        iccid: '8985000000000000001',
        activationCode: `LPA:1$${id}.example.com$ABC`,
        qrCodeUrl: null,
        smdpAddress: `${id}.example.com`,
        installByDate: null,
      };
    },
    async healthCheck(): Promise<ProviderHealth> {
      return {
        providerId: id,
        state: configured ? 'healthy' : 'unconfigured',
        latencyMs: 1,
        message: null,
        checkedAt: new Date().toISOString(),
      };
    },
  };

  return provider;
}

const request: EsimProvisionRequest = {
  orderNumber: 'DN-2026-0001',
  planId: 'thailand-standard',
  countrySlug: 'thailand',
  durationDays: 7,
  dataGbDaily: 2,
  quantity: 1,
  customerEmail: 'traveler@example.com',
  idempotencyKey: 'fulfil:DN-2026-0001',
};

beforeEach(() => {
  __clearProvidersForTest();
  vi.stubEnv('ESIM_PROVIDER_ORDER', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  __clearProvidersForTest();
});

describe('routing', () => {
  it('uses the first supplier in the configured order', async () => {
    const primary = fakeProvider({ id: 'primary' });
    const backup = fakeProvider({ id: 'backup' });
    __registerProviderForTest(primary);
    __registerProviderForTest(backup);
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'primary,backup');

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.esim.providerId).toBe('primary');
    expect(backup.calls).toBe(0);
  });

  it('honours a reordered preference without any code change', async () => {
    __registerProviderForTest(fakeProvider({ id: 'primary' }));
    __registerProviderForTest(fakeProvider({ id: 'backup' }));
    // This is the supplier switch: one environment variable.
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'backup,primary');

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.esim.providerId).toBe('backup');
  });

  it('skips an unconfigured supplier', async () => {
    const unconfigured = fakeProvider({ id: 'unconfigured', configured: false });
    __registerProviderForTest(unconfigured);
    __registerProviderForTest(fakeProvider({ id: 'live' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'unconfigured,live');

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.esim.providerId).toBe('live');
    expect(unconfigured.calls).toBe(0);
  });

  it('skips a supplier that does not carry the plan', async () => {
    const noCoverage = fakeProvider({ id: 'partial', supportedPlans: ['japan-basic'] });
    __registerProviderForTest(noCoverage);
    __registerProviderForTest(fakeProvider({ id: 'full' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'partial,full');

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.esim.providerId).toBe('full');
    // Not even attempted — coverage is checked before we spend a request.
    expect(noCoverage.calls).toBe(0);
  });

  it('reports eligibility without provisioning anything', () => {
    __registerProviderForTest(fakeProvider({ id: 'a' }));
    __registerProviderForTest(fakeProvider({ id: 'b', supportedPlans: ['other'] }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'a,b');

    expect(eligibleProviders('thailand-standard').map((p) => p.id)).toEqual(['a']);
  });
});

describe('failover', () => {
  it('falls over to the backup when the primary fails', async () => {
    const primary = fakeProvider({ id: 'primary', behavior: 'retryable-fail' });
    const backup = fakeProvider({ id: 'backup' });
    __registerProviderForTest(primary);
    __registerProviderForTest(backup);
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'primary,backup');

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.esim.providerId).toBe('backup');
    expect(primary.calls).toBe(1);
    expect(backup.calls).toBe(1);
  });

  it('records every attempt for the audit trail', async () => {
    __registerProviderForTest(fakeProvider({ id: 'primary', behavior: 'retryable-fail' }));
    __registerProviderForTest(fakeProvider({ id: 'backup' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'primary,backup');

    const outcome = await provisionWithFailover(request);

    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts[0]).toMatchObject({ providerId: 'primary', ok: false });
    expect(outcome.attempts[1]).toMatchObject({ providerId: 'backup', ok: true });
  });

  it('also fails over on a permanent error, since another supplier may differ', async () => {
    __registerProviderForTest(fakeProvider({ id: 'primary', behavior: 'permanent-fail' }));
    __registerProviderForTest(fakeProvider({ id: 'backup' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'primary,backup');

    const outcome = await provisionWithFailover(request);
    expect(outcome.ok).toBe(true);
  });

  it('returns a failure value — never throws — when everyone is down', async () => {
    __registerProviderForTest(fakeProvider({ id: 'a', behavior: 'retryable-fail' }));
    __registerProviderForTest(fakeProvider({ id: 'b', behavior: 'retryable-fail' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'a,b');

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('all-failed');
  });

  it('reports no-provider when nothing is eligible', async () => {
    __registerProviderForTest(fakeProvider({ id: 'a', configured: false }));

    const outcome = await provisionWithFailover(request);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('no-provider');
  });
});

describe('circuit breaker', () => {
  it('takes a repeatedly failing supplier out of rotation', async () => {
    const flaky = fakeProvider({ id: 'flaky', behavior: 'retryable-fail' });
    const backup = fakeProvider({ id: 'backup' });
    __registerProviderForTest(flaky);
    __registerProviderForTest(backup);
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'flaky,backup');

    // Three consecutive failures trip the breaker.
    await provisionWithFailover(request);
    await provisionWithFailover(request);
    await provisionWithFailover(request);

    const callsBefore = flaky.calls;
    await provisionWithFailover(request);

    // Fourth order does not pay the latency of a supplier we know is down.
    expect(flaky.calls).toBe(callsBefore);
    expect(providerStatus().find((p) => p.id === 'flaky')?.circuitOpen).toBe(true);
  });

  it('does not trip the breaker on non-retryable errors', async () => {
    const picky = fakeProvider({ id: 'picky', behavior: 'permanent-fail' });
    __registerProviderForTest(picky);
    __registerProviderForTest(fakeProvider({ id: 'backup' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'picky,backup');

    await provisionWithFailover(request);
    await provisionWithFailover(request);
    await provisionWithFailover(request);
    await provisionWithFailover(request);

    // A malformed request is our bug, not their outage — the supplier stays in
    // rotation so a fix takes effect immediately.
    expect(providerStatus().find((p) => p.id === 'picky')?.circuitOpen).toBe(false);
  });

  it('probes again after the cooldown', async () => {
    vi.useFakeTimers();
    const flaky = fakeProvider({ id: 'flaky', behavior: 'retryable-fail' });
    __registerProviderForTest(flaky);
    __registerProviderForTest(fakeProvider({ id: 'backup' }));
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'flaky,backup');

    await provisionWithFailover(request);
    await provisionWithFailover(request);
    await provisionWithFailover(request);
    expect(providerStatus().find((p) => p.id === 'flaky')?.circuitOpen).toBe(true);

    vi.advanceTimersByTime(61_000);

    // Self-healing: recovery needs no deploy and no human.
    expect(providerStatus().find((p) => p.id === 'flaky')?.circuitOpen).toBe(false);
    vi.useRealTimers();
  });

  it('clears failures after a success', async () => {
    resetBreakers();
    const provider = fakeProvider({ id: 'ok' });
    __registerProviderForTest(provider);
    vi.stubEnv('ESIM_PROVIDER_ORDER', 'ok');

    await provisionWithFailover(request);

    expect(providerStatus().find((p) => p.id === 'ok')?.consecutiveFailures).toBe(0);
  });
});
