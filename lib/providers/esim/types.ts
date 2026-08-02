// ─────────────────────────────────────────────────────────────────────────────
// The eSIM supplier PORT.
//
// WHY THIS EXISTS:
//   A supplier is the one dependency we cannot control and cannot afford to be
//   captive to. If Airalo has an outage, rate-limits us, changes commercial
//   terms, or drops a destination, that must be a routing decision — not a
//   rewrite, and not a day of manual work.
//
//   So nothing in the application ever talks to a supplier directly. Everything
//   goes through this interface. Adding a supplier is one adapter file plus one
//   registry entry; switching suppliers is an environment variable.
//
// THE CONTRACT:
//   • Our catalog plan IDs are ours. Suppliers map onto them (see skuMap.ts),
//     never the reverse. A supplier change must never change what a customer
//     sees or what we charge.
//   • provision() is idempotent on idempotencyKey. Retrying must not buy two
//     eSIMs.
//   • Failures declare whether they are retryable, so the registry knows the
//     difference between "try the next supplier" and "stop, this order is bad".
// ─────────────────────────────────────────────────────────────────────────────

/** What we ask a supplier to provision. Supplier-neutral by construction. */
export interface EsimProvisionRequest {
  /** Our order number, for support and reconciliation on both sides. */
  orderNumber: string;
  /** Our catalog plan id, e.g. `thailand-standard`. Adapters map this to a SKU. */
  planId: string;
  countrySlug: string;
  durationDays: number;
  dataGbDaily: number;
  quantity: number;
  customerEmail: string;
  /**
   * Stable across retries of the same fulfilment attempt. Adapters MUST pass
   * this to the supplier's idempotency mechanism where one exists, and MUST
   * treat a duplicate as a lookup rather than a new purchase where it does not.
   */
  idempotencyKey: string;
}

/** A provisioned eSIM, normalized. This is the only shape the app knows about. */
export interface ProvisionedEsim {
  /** Which adapter produced this, recorded on the order for attribution. */
  providerId: string;
  /** The supplier's own reference, for support tickets and reconciliation. */
  providerOrderId: string;
  iccid: string | null;
  /** The LPA activation string, e.g. `LPA:1$rsp.example.com$ABC-123`. */
  activationCode: string | null;
  /** A QR image URL, when the supplier hosts one. */
  qrCodeUrl: string | null;
  /** SM-DP+ address, when supplied separately from the LPA string. */
  smdpAddress: string | null;
  /** When the plan must be installed by, if the supplier enforces a window. */
  installByDate: string | null;
}

/** Live usage for an installed eSIM, when the supplier exposes it. */
export interface EsimUsage {
  iccid: string;
  dataUsedMb: number;
  dataTotalMb: number | null;
  expiresAt: string | null;
  status: 'not-installed' | 'active' | 'expired' | 'unknown';
}

export type ProviderHealthState = 'healthy' | 'degraded' | 'unconfigured' | 'down';

export interface ProviderHealth {
  providerId: string;
  state: ProviderHealthState;
  /** Round-trip time of the health probe, in milliseconds. */
  latencyMs: number | null;
  message: string | null;
  checkedAt: string;
}

/**
 * A supplier failure, with the one bit the registry actually needs: can another
 * supplier plausibly succeed where this one failed?
 *
 *   retryable: true  → transport error, 5xx, timeout, rate limit, out of stock.
 *                      Fail over to the next supplier.
 *   retryable: false → the request itself is wrong (unknown SKU, invalid email,
 *                      order already provisioned). Failing over would just
 *                      produce the same error N more times.
 */
export class ProviderError extends Error {
  readonly providerId: string;
  readonly retryable: boolean;
  readonly code: string;
  readonly status?: number;

  constructor(params: {
    providerId: string;
    code: string;
    message: string;
    retryable: boolean;
    status?: number;
  }) {
    super(params.message);
    this.name = 'ProviderError';
    this.providerId = params.providerId;
    this.code = params.code;
    this.retryable = params.retryable;
    this.status = params.status;
  }

  /** Network-level failures are always worth trying elsewhere. */
  static fromTransport(providerId: string, error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : String(error);
    return new ProviderError({
      providerId,
      code: 'TRANSPORT',
      message: `Could not reach ${providerId}: ${message}`,
      retryable: true,
    });
  }

  /** Maps an HTTP status onto the retryable decision. */
  static fromStatus(providerId: string, status: number, body: string): ProviderError {
    // 4xx means we asked for something wrong — another supplier will not fix a
    // malformed request. 408/425/429 are the exceptions: they are timing, not
    // correctness.
    const retryable = status >= 500 || status === 408 || status === 425 || status === 429;
    return new ProviderError({
      providerId,
      code: `HTTP_${status}`,
      message: `${providerId} responded ${status}: ${body.slice(0, 200)}`,
      retryable,
      status,
    });
  }
}

/**
 * Every eSIM supplier implements this. Nothing else in the application may
 * import a supplier SDK or call a supplier URL directly.
 */
export interface EsimProvider {
  /** Stable identifier, stored on orders. Never rename one in use. */
  readonly id: string;
  /** Human label for the admin panel. */
  readonly name: string;

  /** True when this adapter has the credentials it needs. */
  isConfigured(): boolean;

  /**
   * True when this supplier can fulfil the given catalog plan. Backed by the
   * SKU map — a supplier that does not carry Japan simply returns false and the
   * registry moves on to one that does.
   */
  supports(planId: string): boolean;

  /** Buy and return an eSIM. Must be idempotent on `idempotencyKey`. */
  provision(request: EsimProvisionRequest): Promise<ProvisionedEsim>;

  /** Live usage, where supported. Optional — not every supplier exposes it. */
  getUsage?(iccid: string): Promise<EsimUsage | null>;

  /** Cheap liveness probe. Must not create anything or cost money. */
  healthCheck(): Promise<ProviderHealth>;
}
