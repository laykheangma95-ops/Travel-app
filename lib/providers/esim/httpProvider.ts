// ─────────────────────────────────────────────────────────────────────────────
// Generic HTTP eSIM supplier adapter.
//
// Most eSIM suppliers expose the same shape: a token-authenticated REST API
// with an "order" endpoint that returns an activation code. This class
// implements everything that is common — auth, timeouts, retries with
// backoff, idempotency, error classification, health checks — so a real
// supplier becomes a small config object plus two mapping functions, not a new
// integration.
//
// HOW TO ADD A REAL SUPPLIER (the whole checklist):
//
//   1. Create lib/providers/esim/airalo.ts:
//
//        export const airalo = new HttpEsimProvider({
//          id: 'airalo',
//          name: 'Airalo',
//          baseUrl: process.env.AIRALO_BASE_URL,
//          apiKey: process.env.AIRALO_API_KEY,
//          authHeader: 'Authorization',
//          authScheme: 'Bearer',
//          orderPath: '/v2/orders',
//          healthPath: '/v2/packages?limit=1',
//          toOrderBody: (req, sku) => ({ package_id: sku, quantity: req.quantity }),
//          fromOrderResponse: (json) => ({
//            providerOrderId: json.data.id,
//            iccid: json.data.sims[0].iccid,
//            activationCode: json.data.sims[0].lpa,
//            qrCodeUrl: json.data.sims[0].qrcode_url,
//          }),
//        });
//
//   2. Add its SKUs to skuMap.ts (or the ESIM_SKU_MAP env var).
//   3. Add its id to ESIM_PROVIDER_ORDER.
//
//   Nothing else in the codebase changes. No route, no page, no order logic.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '@/lib/logger';
import { skuFor } from './skuMap';
import {
  ProviderError,
  type EsimProvider,
  type EsimProvisionRequest,
  type EsimUsage,
  type ProvisionedEsim,
  type ProviderHealth,
} from './types';

/** The supplier-specific bits — everything else is handled for you. */
export interface HttpEsimProviderConfig {
  id: string;
  name: string;
  /** Reads from env at call time so an unset key means "unconfigured", not a crash. */
  baseUrl: string | undefined;
  apiKey: string | undefined;
  /** Header carrying the credential. Defaults to `Authorization`. */
  authHeader?: string;
  /** Scheme prefix, e.g. `Bearer`. Pass '' for a bare key header like `X-API-Key`. */
  authScheme?: string;
  /** Endpoint that places an order. */
  orderPath: string;
  /** Cheap GET used for health checks. Must not create anything. */
  healthPath: string;
  /** Optional usage endpoint; `{iccid}` is substituted. */
  usagePath?: string;
  /** Header the supplier reads for idempotency, if it supports one. */
  idempotencyHeader?: string;
  /** Request timeout per attempt. */
  timeoutMs?: number;
  /** Attempts for a retryable failure, including the first. */
  maxAttempts?: number;

  /** Builds the supplier's request body from our neutral request + their SKU. */
  toOrderBody: (request: EsimProvisionRequest, sku: string) => unknown;
  /** Maps the supplier's response onto our normalized shape. */
  fromOrderResponse: (json: unknown) => Omit<ProvisionedEsim, 'providerId'>;
  /** Maps the supplier's usage response, if `usagePath` is set. */
  fromUsageResponse?: (json: unknown, iccid: string) => EsimUsage | null;
}

export class HttpEsimProvider implements EsimProvider {
  readonly id: string;
  readonly name: string;
  private readonly config: HttpEsimProviderConfig;

  constructor(config: HttpEsimProviderConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
  }

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl?.trim() && this.config.apiKey?.trim());
  }

  supports(planId: string): boolean {
    // Coverage is entirely decided by the SKU map: a supplier with no SKU for
    // this plan is skipped, and the registry tries the next one.
    return this.isConfigured() && skuFor(this.id, planId) !== null;
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    const scheme = this.config.authScheme ?? 'Bearer';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [this.config.authHeader ?? 'Authorization']: scheme
        ? `${scheme} ${this.config.apiKey}`
        : String(this.config.apiKey),
    };

    if (idempotencyKey && this.config.idempotencyHeader) {
      headers[this.config.idempotencyHeader] = idempotencyKey;
    }

    return headers;
  }

  private async call(
    path: string,
    init: RequestInit & { idempotencyKey?: string }
  ): Promise<unknown> {
    const { idempotencyKey, ...requestInit } = init;
    const url = `${this.config.baseUrl!.replace(/\/+$/, '')}${path}`;
    const timeoutMs = this.config.timeoutMs ?? 15_000;

    let response: Response;
    try {
      response = await fetch(url, {
        ...requestInit,
        headers: this.headers(idempotencyKey),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (error) {
      throw ProviderError.fromTransport(this.id, error);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw ProviderError.fromStatus(this.id, response.status, body);
    }

    try {
      return await response.json();
    } catch (error) {
      // A 200 we cannot parse is worse than an error status: the supplier may
      // have taken the order. Non-retryable, so a human reconciles it.
      throw new ProviderError({
        providerId: this.id,
        code: 'MALFORMED_RESPONSE',
        message: `${this.id} returned a response we could not parse: ${String(error)}`,
        retryable: false,
      });
    }
  }

  async provision(request: EsimProvisionRequest): Promise<ProvisionedEsim> {
    const sku = skuFor(this.id, request.planId);
    if (!sku) {
      // Not retryable: another attempt at the same supplier will not invent
      // coverage. The registry moves on to a supplier that has this plan.
      throw new ProviderError({
        providerId: this.id,
        code: 'NO_SKU',
        message: `${this.id} has no SKU mapped for plan ${request.planId}.`,
        retryable: false,
      });
    }

    const maxAttempts = this.config.maxAttempts ?? 3;
    let lastError: ProviderError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const json = await this.call(this.config.orderPath, {
          method: 'POST',
          body: JSON.stringify(this.config.toOrderBody(request, sku)),
          idempotencyKey: request.idempotencyKey,
        });

        const mapped = this.config.fromOrderResponse(json);

        // A supplier that returns neither an activation code nor a QR has not
        // actually delivered anything the customer can install.
        if (!mapped.activationCode && !mapped.qrCodeUrl) {
          throw new ProviderError({
            providerId: this.id,
            code: 'EMPTY_FULFILMENT',
            message: `${this.id} accepted the order but returned no activation code or QR.`,
            retryable: false,
          });
        }

        return { ...mapped, providerId: this.id };
      } catch (error) {
        const providerError =
          error instanceof ProviderError ? error : ProviderError.fromTransport(this.id, error);
        lastError = providerError;

        if (!providerError.retryable || attempt === maxAttempts) break;

        // Exponential backoff with jitter, so a supplier recovering from an
        // incident is not hit by every one of our instances simultaneously.
        const backoff = 300 * 2 ** (attempt - 1) + Math.random() * 200;
        log.warn('esim.provider_retry', {
          provider: this.id,
          attempt,
          code: providerError.code,
          backoffMs: Math.round(backoff),
        });
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw lastError ?? ProviderError.fromTransport(this.id, new Error('unknown failure'));
  }

  async getUsage(iccid: string): Promise<EsimUsage | null> {
    if (!this.config.usagePath || !this.config.fromUsageResponse) return null;

    try {
      const json = await this.call(this.config.usagePath.replace('{iccid}', encodeURIComponent(iccid)), {
        method: 'GET',
      });
      return this.config.fromUsageResponse(json, iccid);
    } catch (error) {
      // Usage is a nice-to-have; never let it fail a page.
      log.warn('esim.usage_failed', { provider: this.id, error });
      return null;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        state: 'unconfigured',
        latencyMs: null,
        message: 'Missing base URL or API key.',
        checkedAt,
      };
    }

    const startedAt = Date.now();
    try {
      await this.call(this.config.healthPath, { method: 'GET' });
      const latencyMs = Date.now() - startedAt;
      return {
        providerId: this.id,
        // Slow but answering is worth surfacing before it becomes an outage.
        state: latencyMs > 5000 ? 'degraded' : 'healthy',
        latencyMs,
        message: null,
        checkedAt,
      };
    } catch (error) {
      return {
        providerId: this.id,
        state: 'down',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        checkedAt,
      };
    }
  }
}
