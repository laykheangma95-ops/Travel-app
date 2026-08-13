// ─────────────────────────────────────────────────────────────────────────────
// Customer + admin notifications for an order.
//
// Every channel here is best-effort. A Telegram outage or a bounced email must
// never fail a payment that already succeeded, so all failures are logged and
// swallowed rather than thrown.
// ─────────────────────────────────────────────────────────────────────────────

import { notifyAdminNewOrder } from './telegramOps';
import { sendEsimReadyEmail, sendOrderConfirmationEmail } from './resend';
import { deliverEsim } from './esimDelivery';
import { notify } from './notifications/engine';
import { log } from './logger';
import type { EsimOrder } from '@/types';

async function fanOut(
  order: EsimOrder,
  jobs: Array<[channel: string, run: Promise<unknown>]>
): Promise<void> {
  const results = await Promise.allSettled(jobs.map(([, run]) => run));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.warn('order.notify_failed', {
        orderNumber: order.order_number,
        channel: jobs[index][0],
        error: result.reason,
      });
    }
  });
}

/** Payment settled: tell the customer, and tell ops there is work to do. */
export async function announceOrder(order: EsimOrder): Promise<void> {
  await fanOut(order, [
    ['telegram', notifyAdminNewOrder(order)],
    ['email', sendOrderConfirmationEmail(order)],
  ]);
}

/**
 * eSIM attached: deliver the QR code the confirmation email promised.
 *
 * Delegates to `deliverEsim` (lib/esimDelivery.ts, locked) rather than sending
 * an email directly. That module owns the delivery contract in docs/LOCKED.md:
 * email always goes out when we hold an address, the Telegram push is attempted
 * only when the customer chose it, and each channel stamps its own
 * `delivered_*_at`. Sending from here instead would silently drop the Telegram
 * channel and leave those timestamps unwritten.
 */
export async function announceEsimReady(order: EsimOrder): Promise<void> {
  const outcome = await deliverEsim(order);

  // `sendEsimQrEmail` requires a QR image URL, but an order can legitimately be
  // fulfilled with a manual activation code and no QR (PATCH /api/admin/orders
  // accepts either). Without this the customer would get nothing at all, which
  // is the one outcome invariant 3 forbids — so fall back to the ready email,
  // which renders the activation code as text.
  if (!outcome.email && order.customer_email && order.esim_activation_code) {
    await fanOut(order, [['email-fallback', sendEsimReadyEmail(order)]]);
  }

  // Also record it in the traveler's Domner Inbox, and push it if they asked for
  // eSIM alerts. Deliberately *after* delivery and outside `deliverEsim`: the
  // email and Telegram channels are the locked contract (docs/LOCKED.md
  // invariant 3) and nothing here may affect whether they ran. This is an
  // additional surface, not a replacement — and a guest checkout has no
  // user_id, so there is no inbox to write to.
  if (order.user_id) {
    try {
      await notify({
        userId: order.user_id,
        kind: 'esim.ready',
        title: `Your ${order.country} eSIM is ready`,
        body: `${order.plan_name} · ${order.duration_days} days. Tap to open your QR code.`,
        target: { orderNumber: order.order_number },
        // One card per order, however many times fulfilment is retried.
        dedupeKey: `esim.ready:${order.order_number}`,
      });
    } catch (error) {
      // Same rule as every other channel here: an order that is already paid
      // and delivered must never fail because of a notification.
      log.warn('order.inbox_failed', { orderNumber: order.order_number, error });
    }
  }
}
