// ─────────────────────────────────────────────────────────────────────────────
// eSIM supplier registry — routing, failover and circuit breaking.
//
// WHY THIS EXISTS:
//   Being able to swap suppliers is not the same as surviving one failing at
//   3am. This module turns "we have adapters" into "a supplier outage is not
//   our outage":
//
//     • Ordered preference   — ESIM_PROVIDER_ORDER decides who is tried first,
//                              so commercial changes are a config change.
//     • Coverage routing     — a supplier without a SKU for the plan is skipped
//                              before we spend a request on it.
//     • Automatic failover   — a retryable failure moves to the next supplier
//                              within the same customer request.
//     • Circuit breaker      — a supplier that keeps failing is taken out of
//                              rotation for a cooldown instead of adding
//                              latency to every order.
//     • Honest fallback      — if nobody can fulfil, the order stays paid and
//                              lands in the ops queue. It is never lost, and it
//                              is never marked fulfilled without an eSIM.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '@/lib/logger';
import { SandboxEsimProvider } from './sandbox';
import { ProviderError, type EsimProvider, type EsimProvisionRequest, type ProvisionedEsim, type ProviderHealth } from './types';

/** Registered adapters, by id. Add real suppliers here once written. */
const providers = new Map<string, EsimProvider>();

function register(provider: EsimProvider): void {
  providers.set(provider.id, provider);
}

register(new SandboxEsimProvider());

// Real suppliers slot in here, e.g.:
//   import { airalo } from './airalo';
//   register(airalo);

/** Test seam so the suite can install fakes without touching the real table. */
export function __registerProviderForTest(provider: EsimProvider): void {
  register(provider);
}

export function __clearProvidersForTest(): void {
  providers.clear();
  resetBreakers();
}

/**
 * Preference order. `ESIM_PROVIDER_ORDER=airalo,esimgo,sandbox` makes Airalo
 * primary and eSIM-Go the automatic backup — changing which supplier serves
 * every future order is that one variable.
 */
function preferenceOrder(): string[] {
  const configured = (process.env.ESIM_PROVIDER_ORDER ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;

  // No explicit order: everything registered, sandbox last so a real supplier
  // is always preferred over a test one.
  return [...providers.keys()].sort((a, b) =>
    a === 'sandbox' ? 1 : b === 'sandbox' ? -1 : 0
  );
}

// ── Circuit breaker ──────────────────────────────────────────────────────────

interface Breaker {
  consecutiveFailures: number;
  openedAt: number | null;
}

const breakers = new Map<string, Breaker>();

/** Failures in a row before a supplier is taken out of rotation. */
const FAILURE_THRESHOLD = 3;
/** How long it stays out before we probe it again. */
const COOLDOWN_MS = 60_000;

function breakerFor(id: string): Breaker {
  let breaker = breakers.get(id);
  if (!breaker) {
    breaker = { consecutiveFailures: 0, openedAt: null };
    breakers.set(id, breaker);
  }
  return breaker;
}

function isCircuitOpen(id: string): boolean {
  const breaker = breakerFor(id);
  if (breaker.openedAt === null) return false;

  if (Date.now() - breaker.openedAt >= COOLDOWN_MS) {
    // Half-open: let the next request through to see whether it recovered.
    breaker.openedAt = null;
    breaker.consecutiveFailures = 0;
    log.info('esim.circuit_half_open', { provider: id });
    return false;
  }

  return true;
}

function recordSuccess(id: string): void {
  const breaker = breakerFor(id);
  breaker.consecutiveFailures = 0;
  breaker.openedAt = null;
}

function recordFailure(id: string): void {
  const breaker = breakerFor(id);
  breaker.consecutiveFailures += 1;

  if (breaker.consecutiveFailures >= FAILURE_THRESHOLD && breaker.openedAt === null) {
    breaker.openedAt = Date.now();
    log.error('esim.circuit_opened', {
      provider: id,
      failures: breaker.consecutiveFailures,
      cooldownMs: COOLDOWN_MS,
    });
  }
}

export function resetBreakers(): void {
  breakers.clear();
}

// ── Routing ──────────────────────────────────────────────────────────────────

/** Suppliers that could serve this plan right now, in preference order. */
export function eligibleProviders(planId: string): EsimProvider[] {
  return preferenceOrder()
    .map((id) => providers.get(id))
    .filter((provider): provider is EsimProvider => provider !== undefined)
    .filter((provider) => provider.isConfigured())
    .filter((provider) => provider.supports(planId))
    .filter((provider) => !isCircuitOpen(provider.id));
}

export interface ProvisionAttempt {
  providerId: string;
  ok: boolean;
  code?: string;
  message?: string;
  durationMs: number;
}

export type ProvisionOutcome =
  | { ok: true; esim: ProvisionedEsim; attempts: ProvisionAttempt[] }
  | { ok: false; reason: 'no-provider' | 'all-failed'; attempts: ProvisionAttempt[] };

/**
 * Provisions an eSIM, trying each eligible supplier in order.
 *
 * Never throws. A caller that cannot get an eSIM must still be able to leave
 * the order safely in the ops queue, so failure is a value, not an exception.
 */
export async function provisionWithFailover(
  request: EsimProvisionRequest
): Promise<ProvisionOutcome> {
  const candidates = eligibleProviders(request.planId);
  const attempts: ProvisionAttempt[] = [];

  if (candidates.length === 0) {
    log.warn('esim.no_eligible_provider', {
      orderNumber: request.orderNumber,
      planId: request.planId,
    });
    return { ok: false, reason: 'no-provider', attempts };
  }

  for (const provider of candidates) {
    const startedAt = Date.now();

    try {
      const esim = await provider.provision(request);
      recordSuccess(provider.id);

      attempts.push({ providerId: provider.id, ok: true, durationMs: Date.now() - startedAt });

      log.info('esim.provisioned', {
        orderNumber: request.orderNumber,
        provider: provider.id,
        attempts: attempts.length,
      });

      return { ok: true, esim, attempts };
    } catch (error) {
      const providerError =
        error instanceof ProviderError ? error : ProviderError.fromTransport(provider.id, error);

      // Only count failures that suggest the supplier itself is unhealthy. A
      // missing SKU is our configuration, not their availability, and must not
      // trip the breaker for every other order.
      if (providerError.retryable) recordFailure(provider.id);

      attempts.push({
        providerId: provider.id,
        ok: false,
        code: providerError.code,
        message: providerError.message,
        durationMs: Date.now() - startedAt,
      });

      log.warn('esim.provider_failed', {
        orderNumber: request.orderNumber,
        provider: provider.id,
        code: providerError.code,
        retryable: providerError.retryable,
      });
    }
  }

  log.error('esim.all_providers_failed', {
    orderNumber: request.orderNumber,
    planId: request.planId,
    tried: attempts.map((a) => a.providerId),
  });

  return { ok: false, reason: 'all-failed', attempts };
}

/** Health of every registered supplier, for /api/health and the admin panel. */
export async function checkAllProviders(): Promise<ProviderHealth[]> {
  const results = await Promise.allSettled(
    [...providers.values()].map((provider) => provider.healthCheck())
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;

    const provider = [...providers.values()][index];
    return {
      providerId: provider?.id ?? 'unknown',
      state: 'down' as const,
      latencyMs: null,
      message: String(result.reason),
      checkedAt: new Date().toISOString(),
    };
  });
}

/** Snapshot for the admin panel: who is registered, configured and in rotation. */
export function providerStatus(): Array<{
  id: string;
  name: string;
  configured: boolean;
  circuitOpen: boolean;
  consecutiveFailures: number;
  preferenceRank: number | null;
}> {
  const order = preferenceOrder();

  return [...providers.values()].map((provider) => {
    const rank = order.indexOf(provider.id);
    const breaker = breakerFor(provider.id);
    return {
      id: provider.id,
      name: provider.name,
      configured: provider.isConfigured(),
      circuitOpen: isCircuitOpen(provider.id),
      consecutiveFailures: breaker.consecutiveFailures,
      preferenceRank: rank === -1 ? null : rank,
    };
  });
}

export function getProvider(id: string): EsimProvider | undefined {
  return providers.get(id);
}
