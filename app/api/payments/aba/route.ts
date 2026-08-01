// ─────────────────────────────────────────────────────────────────────────────
// ABA PayWay (KHQR) payments — POST creates an order, PUT receives the callback.
//
// Same security model as the Stripe route: the browser sends intent, the server
// prices the order from the catalog, and only a signature-verified callback can
// move an order to `paid`.
// ─────────────────────────────────────────────────────────────────────────────

import { createAbaPayment, isAbaPaid, verifyAbaWebhook } from '@/lib/aba';
import { announceOrder } from '@/lib/orderNotifications';
import { generateOrderNumber } from '@/lib/utils';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { getUser } from '@/lib/auth';
import { log, redactEmail } from '@/lib/logger';
import { appUrl, demoModeAllowed } from '@/lib/env';
import { detectPriceMismatch, normalizeLines, priceOrder } from '@/lib/pricing';
import { parseCheckoutBody } from '@/lib/checkout';
import {
  createOrder,
  ordersPersistenceAvailable,
  transitionOrder,
} from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── POST /api/payments/aba — create an order + ABA PayWay payment ────────────

export const POST = route(
  async (request) => {
    const body = await readJson<Record<string, unknown>>(request);
    const { customer, idempotencyKey } = parseCheckoutBody(body);

    const priced = priceOrder({
      lines: normalizeLines(body.items),
      discountCode: typeof body.discountCode === 'string' ? body.discountCode : null,
      referralCode: typeof body.referralCode === 'string' ? body.referralCode : null,
    });

    const mismatch = detectPriceMismatch(body.totalUsd, priced.totalUsd);
    if (mismatch !== null) {
      log.warn('checkout.price_mismatch', {
        gateway: 'aba',
        clientTotal: body.totalUsd,
        serverTotal: priced.totalUsd,
        deltaUsd: mismatch,
        email: redactEmail(customer.email),
      });
    }

    const user = await getUser(request);
    const orderNumber = generateOrderNumber();

    const payment = createAbaPayment({
      amountUsd: priced.totalUsd,
      orderNumber,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      returnUrl: `${appUrl()}/order-confirmation/${orderNumber}?method=aba`,
    });

    if (!ordersPersistenceAvailable()) {
      log.warn('checkout.no_persistence', { orderNumber, gateway: 'aba' });
      return ok(
        {
          orderNumber,
          demo: payment.demo,
          totalUsd: priced.totalUsd,
          persisted: false,
          ...(payment.demo ? {} : { paymentUrl: payment.paymentUrl, fields: payment.fields }),
        },
        { status: 201 }
      );
    }

    const order = await createOrder({
      orderNumber,
      priced,
      customer,
      paymentMethod: 'aba',
      userId: user?.id ?? null,
      idempotencyKey,
      demo: payment.demo,
    });

    // Development only — see the Stripe route for why this cannot run in production.
    if (payment.demo && demoModeAllowed) {
      const result = await transitionOrder(order.order_number, 'paid', {
        actor: 'demo-mode',
        detail: { reason: 'ABA PayWay not configured; development fallback' },
      });
      if (result.changed) await announceOrder(result.order);

      return ok(
        { orderNumber: order.order_number, demo: true, totalUsd: priced.totalUsd, persisted: true },
        { status: 201 }
      );
    }

    return ok(
      {
        orderNumber: order.order_number,
        demo: false,
        totalUsd: priced.totalUsd,
        subtotalUsd: priced.subtotalUsd,
        discountUsd: priced.discountUsd,
        persisted: true,
        paymentUrl: payment.paymentUrl,
        fields: 'fields' in payment ? payment.fields : undefined,
      },
      { status: 201 }
    );
  },
  { rateLimit: 'checkout', name: 'payments.aba.create' }
);

// ── PUT /api/payments/aba — ABA PayWay callback ──────────────────────────────

export const PUT = route(
  async (request) => {
    const body = await readJson<Record<string, unknown>>(request);

    if (!verifyAbaWebhook(body)) {
      throw new ApiError('BAD_REQUEST', 'Invalid webhook signature.');
    }

    const orderNumber = typeof body.tran_id === 'string' ? body.tran_id : null;
    if (!orderNumber) {
      log.warn('aba.webhook_missing_tran_id');
      return ok({ received: true, ignored: 'no tran_id' });
    }

    const paid = isAbaPaid(body.status);

    const result = await transitionOrder(orderNumber, paid ? 'paid' : 'cancelled', {
      actor: 'aba-webhook',
      patch: paid ? { aba_payment_id: String(body.apv ?? '') || null } : {},
      detail: { status: body.status ?? null },
    });

    // Only a real state change notifies, so a redelivered callback stays silent.
    if (result.changed && paid) await announceOrder(result.order);

    return ok({ received: true });
  },
  { name: 'payments.aba.webhook' }
);
