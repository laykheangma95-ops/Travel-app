// ─────────────────────────────────────────────────────────────────────────────
// The order pipeline shared by every payment gateway.
//
// WHY THIS IS A LIBRARY AND NOT A ROUTE:
//   `app/api/payments/stripe/route.ts` and `.../aba/route.ts` are partially
//   locked (docs/LOCKED.md): their delivery_channel persistence and Telegram
//   connect-token minting were reviewed as part of the eSIM delivery contract
//   and must keep living in those files. So the gateway-agnostic work — pricing,
//   authorization, persistence, webhook reconciliation, status transitions —
//   lives here, and each route stays a thin shell that adds its own locked
//   delivery step. One pipeline, no copy-paste, lock intact.
//
// The security model is non-negotiable:
//   • the browser sends intent, the server computes the price
//   • only a signature-verified webhook can move an order to `paid`
//   • the settled amount is reconciled against the order before fulfilment
// ─────────────────────────────────────────────────────────────────────────────

import { generateOrderNumber } from '@/lib/utils';
import { ApiError } from '@/lib/http';
import { getUser } from '@/lib/serverAuth';
import { log, redactEmail } from '@/lib/logger';
import { logSupabaseError } from '@/lib/supabaseError';
import { appUrl, demoModeAllowed } from '@/lib/env';
import { detectPriceMismatch, normalizeLines, priceOrder, toCents } from '@/lib/pricing';
import { parseCheckoutBody } from '@/lib/checkout';
import { getSupabaseAdmin } from '@/lib/supabase';
import { announceOrder } from '@/lib/orderNotifications';
import { fulfilOrder } from '@/lib/fulfilment';
import { getPaymentProvider } from '@/lib/providers/payments/registry';
import type { PaymentSession } from '@/lib/providers/payments/types';
import {
  createOrder,
  getOrderByNumber,
  ordersPersistenceAvailable,
  transitionOrder,
} from '@/lib/orders';
import type { DeliveryChannel, EsimOrder, PaymentMethod } from '@/types';

/** Shapes the gateway session for the browser without leaking internals. */
function sessionResponse(session: PaymentSession): Record<string, unknown> {
  switch (session.kind) {
    case 'client-secret':
      return { kind: session.kind, clientSecret: session.clientSecret, demo: session.demo };
    case 'redirect':
      return { kind: session.kind, paymentUrl: session.url, demo: session.demo };
    case 'form-post':
      return {
        kind: session.kind,
        paymentUrl: session.url,
        fields: session.fields,
        demo: session.demo,
      };
  }
}

export interface StartedPayment {
  orderNumber: string;
  /** Null when Supabase is not configured (development without persistence). */
  order: EsimOrder | null;
  /** The customer's delivery choice, for the route's locked delivery step. */
  deliveryChannel: DeliveryChannel;
  /** Null when the customer bought without giving a number — that is allowed. */
  customerPhone: string | null;
  /** Everything the browser needs, minus the route's locked delivery fields. */
  payload: Record<string, unknown>;
}

/**
 * Prices the cart, creates the order and starts the gateway payment.
 *
 * Returns rather than responds, so the calling route can perform its locked
 * delivery step (minting the Telegram connect link) before answering.
 */
export async function startPayment(
  request: Request,
  providerId: PaymentMethod
): Promise<StartedPayment> {
  const provider = getPaymentProvider(providerId);
  if (!provider) {
    throw new ApiError('NOT_FOUND', 'That payment method is not available.');
  }

  const body = (await request.json()) as Record<string, unknown>;
  const { customer, idempotencyKey } = parseCheckoutBody(body);

  // The only numbers that matter are computed here, from the catalog.
  const priced = priceOrder({
    lines: normalizeLines(body.items),
    discountCode: typeof body.discountCode === 'string' ? body.discountCode : null,
    referralCode: typeof body.referralCode === 'string' ? body.referralCode : null,
  });

  // A total from the browser is never trusted, but a mismatch is worth seeing:
  // it is either a stale cart or someone editing localStorage.
  const mismatch = detectPriceMismatch(body.totalUsd, priced.totalUsd);
  if (mismatch !== null) {
    log.warn('checkout.price_mismatch', {
      gateway: provider.id,
      clientTotal: body.totalUsd,
      serverTotal: priced.totalUsd,
      deltaUsd: mismatch,
      email: redactEmail(customer.email),
    });
  }

  const user = await getUser(request);
  const orderNumber = generateOrderNumber();

  const session = await provider.createPayment({
    orderNumber,
    amountCents: priced.totalCents,
    currency: 'USD',
    customerName: customer.fullName,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    returnUrl: `${appUrl()}/order-confirmation/${orderNumber}?method=${provider.id}`,
    idempotencyKey,
  });

  const deliveryChannel: DeliveryChannel = customer.deliveryChannel ?? 'email';

  if (!ordersPersistenceAvailable()) {
    // Development without Supabase: the UI flow works, nothing is recorded,
    // and nothing is claimed to be paid.
    log.warn('checkout.no_persistence', { orderNumber, gateway: provider.id });
    return {
      orderNumber,
      order: null,
      deliveryChannel,
      customerPhone: customer.phone || null,
      payload: {
        orderNumber,
        totalUsd: priced.totalUsd,
        persisted: false,
        ...sessionResponse(session),
      },
    };
  }

  const order = await createOrder({
    orderNumber,
    priced,
    customer,
    paymentMethod: provider.id as PaymentMethod,
    userId: user?.id ?? null,
    idempotencyKey,
    demo: session.demo,
  });

  await attachPatch(order.order_number, paymentIdColumn(provider.id, session.paymentId));

  // Development convenience only. `demoModeAllowed` is false in production,
  // and the adapter would have thrown before reaching here.
  if (session.demo && demoModeAllowed) {
    const settled = await transitionOrder(order.order_number, 'paid', {
      actor: 'demo-mode',
      detail: { reason: `${provider.id} not configured; development fallback` },
    });
    if (settled.changed) {
      await announceOrder(settled.order);
      await fulfilOrder(settled.order);
    }
  }

  return {
    orderNumber: order.order_number,
    order,
    deliveryChannel: order.delivery_channel ?? deliveryChannel,
    // `||` not `??`: an empty string is "no phone given", same as null.
    customerPhone: order.customer_phone || customer.phone || null,
    payload: {
      orderNumber: order.order_number,
      totalUsd: priced.totalUsd,
      subtotalUsd: priced.subtotalUsd,
      discountUsd: priced.discountUsd,
      persisted: true,
      ...sessionResponse(session),
    },
  };
}

/**
 * Verifies a gateway webhook and drives the order to its next state.
 *
 * Every path returns a 200-shaped body: a gateway that receives an error
 * retries forever, and a webhook we deliberately ignored is not an error.
 */
export async function handlePaymentWebhook(
  request: Request,
  providerId: PaymentMethod
): Promise<Record<string, unknown>> {
  const provider = getPaymentProvider(providerId);
  if (!provider) {
    throw new ApiError('NOT_FOUND', 'That payment method is not available.');
  }

  // Raw body: verifying a signature requires the exact bytes the gateway signed.
  const rawBody = await request.text();
  const event = await provider.verifyAndParseWebhook(rawBody, request.headers);

  if (!event) {
    throw new ApiError('BAD_REQUEST', 'Invalid webhook signature.');
  }

  if (event.type === 'ignored') {
    return { received: true, ignored: event.reason };
  }

  if (!event.orderNumber) {
    log.warn('payments.webhook_missing_order', { gateway: provider.id, type: event.type });
    return { received: true, ignored: 'no order reference' };
  }

  if (event.type === 'failed') {
    await transitionOrder(event.orderNumber, 'cancelled', {
      actor: `${provider.id}-webhook`,
      detail: { reason: event.reason, paymentId: event.paymentId },
    });
    return { received: true };
  }

  if (event.type === 'refunded') {
    await transitionOrder(event.orderNumber, 'refunded', {
      actor: `${provider.id}-webhook`,
      detail: { reason: event.reason, paymentId: event.paymentId },
    });
    return { received: true };
  }

  // ── succeeded ──
  const order = await getOrderByNumber(event.orderNumber);
  if (!order) {
    log.warn('payments.webhook_unknown_order', {
      gateway: provider.id,
      orderNumber: event.orderNumber,
    });
    return { received: true, ignored: 'unknown order' };
  }

  // Reconcile when the gateway tells us what it settled. A null amount means
  // the gateway does not report one — we do not treat that as verified.
  if (event.settledAmountCents !== null) {
    const expected = toCents(Number(order.price_usd));
    if (event.settledAmountCents < expected) {
      log.error('payments.underpayment', {
        gateway: provider.id,
        orderNumber: event.orderNumber,
        settledCents: event.settledAmountCents,
        expectedCents: expected,
      });
      // Left pending so a human reconciles, rather than the system handing
      // out an eSIM that was underpaid.
      return { received: true, flagged: 'amount_mismatch' };
    }
  }

  const result = await transitionOrder(event.orderNumber, 'paid', {
    actor: `${provider.id}-webhook`,
    patch: paymentIdColumn(provider.id, event.paymentId),
    detail: { paymentId: event.paymentId, settledCents: event.settledAmountCents },
  });

  // `changed` is false on a redelivered webhook, so the customer gets exactly
  // one confirmation email and exactly one fulfilment attempt.
  if (result.changed) {
    await announceOrder(result.order);
    // Auto-provision through the supplier registry. Falls back to the ops
    // queue if no supplier can deliver — never marks fulfilled without an eSIM.
    await fulfilOrder(result.order);
  }

  return { received: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Each gateway stores its reference in its own column. */
function paymentIdColumn(providerId: string, paymentId: string | null): Record<string, unknown> {
  if (!paymentId) return {};
  if (providerId === 'stripe') return { stripe_payment_id: paymentId };
  if (providerId === 'aba') return { aba_payment_id: paymentId };
  return { provider_order_id: paymentId };
}

async function attachPatch(orderNumber: string, patch: Record<string, unknown>): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from('esim_orders')
    .update(patch)
    .eq('order_number', orderNumber);

  if (error) logSupabaseError('order.attach_payment_id_failed', error, { orderNumber });
}
