// ─────────────────────────────────────────────────────────────────────────────
// Sandbox eSIM supplier.
//
// A fully working adapter that provisions plausible eSIMs without calling
// anyone. It exists so the entire pipeline — payment settles, eSIM is
// provisioned, order is fulfilled, customer is emailed a QR code — can be run,
// demoed and tested today, before a supplier contract exists.
//
// It is also where failure modes are rehearsed. `ESIM_SANDBOX_FAILURE_RATE`
// makes it fail on demand, which is how the registry's failover is verified
// against something that behaves like a real, occasionally-unreliable API.
//
// SAFETY: refuses to run in production unless explicitly allowed, so it can
// never silently "fulfil" a real customer's order with a fake eSIM.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { demoModeAllowed, isProduction } from '@/lib/env';
import { log } from '@/lib/logger';
import {
  ProviderError,
  type EsimProvider,
  type EsimProvisionRequest,
  type EsimUsage,
  type ProvisionedEsim,
  type ProviderHealth,
} from './types';

const ID = 'sandbox';

/** Deterministic per idempotency key, so a retry returns the same eSIM. */
function deterministicHex(seed: string, length: number): string {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, length).toUpperCase();
}

function failureRate(): number {
  const raw = Number(process.env.ESIM_SANDBOX_FAILURE_RATE ?? '0');
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0;
}

export class SandboxEsimProvider implements EsimProvider {
  readonly id = ID;
  readonly name = 'Sandbox (test supplier)';

  isConfigured(): boolean {
    // Available in development by default. In production it requires the same
    // explicit opt-in as every other demo fallback — a sandbox eSIM is not a
    // product, and a customer must never receive one by accident.
    if (!isProduction) return true;
    return demoModeAllowed && process.env.ESIM_SANDBOX_ENABLED === 'true';
  }

  /** The sandbox can serve the whole catalog — that is the point of it. */
  supports(): boolean {
    return this.isConfigured();
  }

  async provision(request: EsimProvisionRequest): Promise<ProvisionedEsim> {
    // Simulated network latency, so timeouts and loading states get exercised.
    await new Promise((resolve) => setTimeout(resolve, 120));

    if (Math.random() < failureRate()) {
      // Retryable on purpose: this is the failure the registry should route
      // around rather than surface to the customer.
      throw new ProviderError({
        providerId: ID,
        code: 'SANDBOX_INJECTED_FAILURE',
        message: 'Injected sandbox failure (ESIM_SANDBOX_FAILURE_RATE).',
        retryable: true,
      });
    }

    const seed = request.idempotencyKey || request.orderNumber;
    const iccid = `8985${deterministicHex(seed, 15)}`.slice(0, 19);
    const matchingId = deterministicHex(`${seed}:activation`, 16);

    log.info('esim.sandbox_provisioned', {
      orderNumber: request.orderNumber,
      planId: request.planId,
    });

    return {
      providerId: ID,
      providerOrderId: `SBX-${deterministicHex(seed, 10)}`,
      iccid,
      activationCode: `LPA:1$sandbox.domnerapp.com$${matchingId}`,
      // A real supplier returns a hosted PNG. We return a data-URI QR built by
      // the caller's UI instead of inventing a URL that would 404.
      qrCodeUrl: null,
      smdpAddress: 'sandbox.domnerapp.com',
      installByDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async getUsage(iccid: string): Promise<EsimUsage | null> {
    return {
      iccid,
      dataUsedMb: 420,
      dataTotalMb: 2048,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      providerId: ID,
      state: this.isConfigured() ? 'healthy' : 'unconfigured',
      latencyMs: 0,
      message: this.isConfigured()
        ? 'Sandbox supplier — issues test eSIMs that will not connect to a real network.'
        : 'Sandbox is disabled in production.',
      checkedAt: new Date().toISOString(),
    };
  }
}
