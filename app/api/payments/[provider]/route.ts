// ─────────────────────────────────────────────────────────────────────────────
// Payments — one route, any gateway.
//
//   POST /api/payments/{provider}  — price the cart, create the order, start payment
//   PUT  /api/payments/{provider}  — the gateway's webhook
//
// URLs are unchanged (`/api/payments/stripe`, `/api/payments/aba`), but the two
// hand-written routes that duplicated the entire order pipeline are gone. A new
// gateway is now an adapter file plus a registry line — this file never changes.
//
// The security model is unchanged and non-negotiable:
//   • the browser sends intent, the server computes the price
//   • only a signature-verified webhook can move an order to `paid`
//   • the settled amount is reconciled against the order before fulfilment
// ─────────────────────────────────────────────────────────────────────────────

import { generateOrderNumber } from '@/lib/utils';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { getUser } from '@/lib/auth';
import { log, redactEmail } from '@/lib/logger';
import { appUrl, demoModeAllowed } from '@/lib/env';
import { detectPriceMismatch, normalizeLines, priceOrder, toCents } from '@/lib/pricing';
import { parseCheckoutBody } from '@/lib/checkout';
import { getSupabaseAdmin } from '@/lib/supabase';
import { announceOrder } from '@/lib/orderNotifications';
import { fulfilOrder } from '@/lib/fulfilment';
import { getPaymentProvider } from '@/lib/providers/payments/registry';
import type { PaymentProvider, PaymentSession } from '@/lib/providers/payments/types';
import {
  createOrder,
  getOrderByNumber,
  ordersPersistenceAvailable,
  transitionOrder,
} from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolves the `{provider}` segment to a registered gateway. */
function resolveProvider(request: Request): PaymentProvider {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1] ?? '';

  const provider = getPaymentProvider(id);
  if (!provider) {
    throw new ApiError('NOT_FOUND', 'That payment method is not available.');
  }
  return provider;
}

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

// ── POST — create the order and start the payment ────────────────────────────

export const POST = route(
  async (request) => {
    const provider = resolveProvider(request);
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

    if (!ordersPersistenceAvailable()) {
      // Development without Supabase: the UI flow works, nothing is recorded,
      // and nothing is claimed to be paid.
      log.warn('checkout.no_persistence', { orderNumber, gateway: provider.id });
      return ok(
        { orderNumber, totalUsd: priced.totalUsd, persisted: false, ...sessionResponse(session) },
        { status: 201 }
      );
    }

    const order = await createOrder({
      orderNumber,
      priced,
      customer,
      paymentMethod: provider.id as 'stripe' | 'aba',
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

    return ok(
      {
        orderNumber: order.order_number,
        totalUsd: priced.totalUsd,
        subtotalUsd: priced.subtotalUsd,
        discountUsd: priced.discountUsd,
        persisted: true,
        ...sessionResponse(session),
      },
      { status: 201 }
    );
  },
  { rateLimit: 'checkout', name: 'payments.create' }
);

// ── PUT — the gateway's webhook ──────────────────────────────────────────────

export const PUT = route(
  async (request) => {
    const provider = resolveProvider(request);

    // Raw body: verifying a signature requires the exact bytes the gateway signed.
    const rawBody = await request.text();
    const event = await provider.verifyAndParseWebhook(rawBody, request.headers);

    if (!event) {
      throw new ApiError('BAD_REQUEST', 'Invalid webhook signature.');
    }

    if (event.type === 'ignored') {
      return ok({ received: true, ignored: event.reason });
    }

    if (!event.orderNumber) {
      log.warn('payments.webhook_missing_order', { gateway: provider.id, type: event.type });
      return ok({ received: true, ignored: 'no order reference' });
    }

    if (event.type === 'failed') {
      await transitionOrder(event.orderNumber, 'cancelled', {
        actor: `${provider.id}-webhook`,
        detail: { reason: event.reason, paymentId: event.paymentId },
      });
      return ok({ received: true });
    }

    if (event.type === 'refunded') {
      await transitionOrder(event.orderNumber, 'refunded', {
        actor: `${provider.id}-webhook`,
        detail: { reason: event.reason, paymentId: event.paymentId },
      });
      return ok({ received: true });
    }

    // ── succeeded ──
    const order = await getOrderByNumber(event.orderNumber);
    if (!order) {
      log.warn('payments.webhook_unknown_order', {
        gateway: provider.id,
        orderNumber: event.orderNumber,
      });
      return ok({ received: true, ignored: 'unknown order' });
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
        return ok({ received: true, flagged: 'amount_mismatch' });
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

    return ok({ received: true });
  },
  { name: 'payments.webhook' }
);

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

  if (error) log.warn('order.attach_payment_id_failed', { orderNumber, error });
}
