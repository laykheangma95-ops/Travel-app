// ─────────────────────────────────────────────────────────────────────────────
// Stripe payments — POST creates an order, PUT receives the webhook.
//
// SECURITY MODEL:
//   The request body carries INTENT ONLY: which plan, how many, which promo
//   code, and who the customer is. The amount charged is computed here from the
//   catalog via lib/pricing.ts. A `totalUsd` sent by the browser is compared for
//   telemetry and then discarded — it can never influence the charge.
//
//   An order becomes `paid` in exactly one place: a webhook whose signature
//   Stripe verified and whose settled amount covers the order total. Not on the
//   checkout response, and never because a key happened to be missing.
// ─────────────────────────────────────────────────────────────────────────────

import { createPaymentIntent, settledAmountCents, verifyStripeWebhook } from '@/lib/stripe';
import { announceOrder } from '@/lib/orderNotifications';
import { generateOrderNumber } from '@/lib/utils';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { getUser } from '@/lib/auth';
import { log, redactEmail } from '@/lib/logger';
import { demoModeAllowed } from '@/lib/env';
import { detectPriceMismatch, normalizeLines, priceOrder, toCents } from '@/lib/pricing';
import { parseCheckoutBody } from '@/lib/checkout';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  createOrder,
  getOrderByNumber,
  ordersPersistenceAvailable,
  transitionOrder,
} from '@/lib/orders';
import type Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── POST /api/payments/stripe — create an order + Stripe payment intent ───────

export const POST = route(
  async (request) => {
    const body = await readJson<Record<string, unknown>>(request);
    const { customer, idempotencyKey } = parseCheckoutBody(body);

    // The only numbers that matter are computed here, from the catalog.
    const priced = priceOrder({
      lines: normalizeLines(body.items),
      discountCode: typeof body.discountCode === 'string' ? body.discountCode : null,
      referralCode: typeof body.referralCode === 'string' ? body.referralCode : null,
    });

    const mismatch = detectPriceMismatch(body.totalUsd, priced.totalUsd);
    if (mismatch !== null) {
      // Not fatal — the customer simply pays the catalog price — but a
      // persistent gap means a stale client or someone probing the checkout.
      log.warn('checkout.price_mismatch', {
        clientTotal: body.totalUsd,
        serverTotal: priced.totalUsd,
        deltaUsd: mismatch,
        email: redactEmail(customer.email),
      });
    }

    const user = await getUser(request);
    const orderNumber = generateOrderNumber();

    const intent = await createPaymentIntent({
      amountCents: priced.totalCents,
      orderNumber,
      customerEmail: customer.email,
      idempotencyKey,
      metadata: { user_id: user?.id ?? 'guest' },
    });

    if (!ordersPersistenceAvailable()) {
      // Development without Supabase: the UI flow still works, but nothing is
      // recorded and nothing is claimed to be paid.
      log.warn('checkout.no_persistence', { orderNumber });
      return ok(
        {
          orderNumber,
          clientSecret: intent.clientSecret,
          demo: intent.demo,
          totalUsd: priced.totalUsd,
          persisted: false,
        },
        { status: 201 }
      );
    }

    const order = await createOrder({
      orderNumber,
      priced,
      customer,
      paymentMethod: 'stripe',
      userId: user?.id ?? null,
      idempotencyKey,
      demo: intent.demo,
    });

    await attachPatch(order.order_number, { stripe_payment_id: intent.paymentIntentId });

    // Development convenience only: with no Stripe keys there will never be a
    // webhook, so the order is settled here. `demoModeAllowed` is false in
    // production, and createPaymentIntent would have thrown before reaching it.
    if (intent.demo && demoModeAllowed) {
      const result = await transitionOrder(order.order_number, 'paid', {
        actor: 'demo-mode',
        detail: { reason: 'stripe not configured; development fallback' },
      });
      if (result.changed) await announceOrder(result.order);
    }

    return ok(
      {
        orderNumber: order.order_number,
        clientSecret: intent.clientSecret,
        demo: intent.demo,
        totalUsd: priced.totalUsd,
        subtotalUsd: priced.subtotalUsd,
        discountUsd: priced.discountUsd,
        persisted: true,
      },
      { status: 201 }
    );
  },
  { rateLimit: 'checkout', name: 'payments.stripe.create' }
);

// ── PUT /api/payments/stripe — Stripe webhook ────────────────────────────────

export const PUT = route(
  async (request) => {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') ?? '';

    const event = verifyStripeWebhook(payload, signature);
    if (!event) {
      throw new ApiError('BAD_REQUEST', 'Invalid webhook signature.');
    }

    if (
      event.type !== 'payment_intent.succeeded' &&
      event.type !== 'payment_intent.payment_failed'
    ) {
      return ok({ received: true, ignored: event.type });
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    const orderNumber = intent.metadata?.order_number;

    if (!orderNumber) {
      log.warn('stripe.webhook_missing_order_number', { intentId: intent.id, type: event.type });
      return ok({ received: true, ignored: 'no order_number in metadata' });
    }

    if (event.type === 'payment_intent.payment_failed') {
      await transitionOrder(orderNumber, 'cancelled', {
        actor: 'stripe-webhook',
        detail: { intentId: intent.id, reason: intent.last_payment_error?.message ?? null },
      });
      return ok({ received: true });
    }

    // Reconcile before settling: never fulfil an order for less than its price.
    const order = await getOrderByNumber(orderNumber);
    if (!order) {
      log.warn('stripe.webhook_unknown_order', { orderNumber, intentId: intent.id });
      return ok({ received: true, ignored: 'unknown order' });
    }

    const settled = settledAmountCents(intent);
    const expected = toCents(Number(order.price_usd));

    if (settled < expected) {
      log.error('stripe.underpayment', {
        orderNumber,
        intentId: intent.id,
        settledCents: settled,
        expectedCents: expected,
      });
      // Left pending on purpose so a human reconciles, rather than the system
      // handing out an eSIM that was underpaid.
      return ok({ received: true, flagged: 'amount_mismatch' });
    }

    const result = await transitionOrder(orderNumber, 'paid', {
      actor: 'stripe-webhook',
      patch: { stripe_payment_id: intent.id },
      detail: { intentId: intent.id, settledCents: settled },
    });

    // `changed` is false when Stripe redelivers the same event, so the customer
    // gets exactly one confirmation email however many times it fires.
    if (result.changed) await announceOrder(result.order);

    return ok({ received: true });
  },
  { name: 'payments.stripe.webhook' }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function attachPatch(orderNumber: string, patch: Record<string, string>): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase
    .from('esim_orders')
    .update(patch)
    .eq('order_number', orderNumber);
  if (error) log.warn('order.attach_payment_id_failed', { orderNumber, error });
}
