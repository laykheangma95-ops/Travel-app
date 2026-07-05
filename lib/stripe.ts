import Stripe from 'stripe';

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
  amountUsd: number;
  orderNumber: string;
  customerEmail: string;
}

export async function createPaymentIntent(input: CreatePaymentIntentInput) {
  const stripe = getStripe();
  if (!stripe) {
    // Sandbox fallback: the checkout flow still works end-to-end in demo mode.
    return {
      demo: true as const,
      clientSecret: `demo_secret_${input.orderNumber}`,
      paymentIntentId: `demo_pi_${input.orderNumber}`,
    };
  }
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(input.amountUsd * 100),
    currency: 'usd',
    receipt_email: input.customerEmail,
    metadata: { order_number: input.orderNumber },
    automatic_payment_methods: { enabled: true },
  });
  return {
    demo: false as const,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
  };
}

export function verifyStripeWebhook(payload: string, signature: string): Stripe.Event | null {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return null;
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return null;
  }
}
