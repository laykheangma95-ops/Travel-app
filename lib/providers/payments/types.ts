// ─────────────────────────────────────────────────────────────────────────────
// The payment gateway PORT.
//
// WHY THIS EXISTS:
//   Stripe and ABA PayWay had a hand-written route each, with the order logic
//   copy-pasted between them. Adding Wing, Acleda or a third gateway meant a
//   third copy — and three places for the pricing rule to drift out of sync.
//
//   Now there is one route (`/api/payments/[provider]`) and one order pipeline.
//   A gateway is an adapter that answers three questions: how do I start a
//   payment, is this webhook genuine, and what did it tell me.
//
// THE CONTRACT:
//   • createPayment() receives an amount in CENTS that the server computed.
//     An adapter must never accept an amount from a request body.
//   • verifyWebhook() returns null for anything it cannot cryptographically
//     verify. Unverified and forged are the same thing.
//   • parseWebhookEvent() normalizes the gateway's vocabulary into ours, so the
//     order pipeline never learns gateway-specific status codes.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePaymentInput {
  orderNumber: string;
  /** Server-computed, from lib/pricing.ts. Never client-supplied. */
  amountCents: number;
  currency: 'USD';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  /** Where the gateway should send the customer back to. */
  returnUrl: string;
  /** Stable per checkout attempt; passed to the gateway's idempotency support. */
  idempotencyKey: string;
}

/**
 * How the browser should continue. Three shapes cover every gateway we have
 * seen: confirm in-page, redirect, or POST a signed form.
 */
export type PaymentSession =
  /** Stripe-style: confirm client-side with a secret. */
  | { kind: 'client-secret'; paymentId: string; clientSecret: string | null; demo: boolean }
  /** Redirect the browser to a hosted checkout page. */
  | { kind: 'redirect'; paymentId: string; url: string; demo: boolean }
  /** ABA-style: POST a signed field set to the gateway. */
  | { kind: 'form-post'; paymentId: string; url: string; fields: Record<string, string>; demo: boolean };

/** A gateway event, normalized. The order pipeline only ever sees this. */
export interface PaymentEvent {
  /** Our order number, recovered from gateway metadata. */
  orderNumber: string | null;
  type: 'succeeded' | 'failed' | 'refunded' | 'ignored';
  /** The gateway's payment identifier, stored for reconciliation. */
  paymentId: string | null;
  /** What the gateway says it actually settled, for amount reconciliation. */
  settledAmountCents: number | null;
  /** Free-form reason, surfaced in the order audit trail. */
  reason: string | null;
}

export interface PaymentProvider {
  /** Stable id — also the URL segment, e.g. `/api/payments/stripe`. */
  readonly id: string;
  /** Label shown on the checkout page. */
  readonly label: string;

  isConfigured(): boolean;

  /** Starts a payment. Throws ConfigurationError in production if unconfigured. */
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>;

  /**
   * Verifies a webhook and returns the normalized event, or null if the
   * signature does not check out.
   *
   * Receives the RAW body — parsing before verifying would break signature
   * schemes that sign the exact bytes.
   */
  verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>;
}
