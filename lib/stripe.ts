import Stripe from 'stripe';
import { assertConfigured } from './env';
import { log } from './logger';

// Server-side Stripe client. Lazily constructed so builds succeed without keys.
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return stripeClient;
}

export interface CreatePaymentIntentInput {
  /**
   * Amount in cents, computed by lib/pricing.ts from the catalog.
   * Deliberately an integer, and deliberately never sourced from the client.
   */
  amountCents: number;
  orderNumber: string;
  customerEmail: string;
  /** Reused across retries of the same checkout so Stripe never double-charges. */
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export type PaymentIntentResult =
  | { demo: false; clientSecret: string | null; paymentIntentId: string }
  | { demo: true; clientSecret: string; paymentIntentId: string };

/**
 * Creates a Stripe PaymentIntent.
 *
 * In development without keys this returns a clearly-labelled demo intent.
 * In production `assertConfigured` throws instead — a missing key is an outage,
 * never a free order.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput
): Promise<PaymentIntentResult> {
  const live = assertConfigured('stripe');
  const stripe = getStripe();

  if (!live || !stripe) {
    log.warn('stripe.demo_intent', { orderNumber: input.orderNumber });
    return {
      demo: true,
      clientSecret: `demo_secret_${input.orderNumber}`,
      paymentIntentId: `demo_pi_${input.orderNumber}`,
    };
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: 'usd',
      receipt_email: input.customerEmail,
      metadata: { order_number: input.orderNumber, ...input.metadata },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: input.idempotencyKey }
  );

  return { demo: false, clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

/**
 * Verifies a Stripe webhook signature.
 *
 * Returns null on any failure — an unverified event is indistinguishable from a
 * forged one, and both must be ignored.
 */
export function verifyStripeWebhook(payload: string, signature: string): Stripe.Event | null {
  // Throws in production when the webhook secret is absent, which is correct:
  // silently accepting unverified payment events is worse than a 503.
  assertConfigured('stripeWebhook');

  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return null;

  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    log.warn('stripe.webhook_signature_invalid', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** What Stripe actually settled, so it can be reconciled against our own total. */
export function settledAmountCents(intent: Stripe.PaymentIntent): number {
  return intent.amount_received || intent.amount || 0;
}
