// ─────────────────────────────────────────────────────────────────────────────
// Customer + admin notifications for an order.
//
// Every channel here is best-effort. A Telegram outage or a bounced email must
// never fail a payment that already succeeded, so all failures are logged and
// swallowed rather than thrown.
// ─────────────────────────────────────────────────────────────────────────────

import { notifyAdminNewOrder } from './telegram';
import { sendEsimReadyEmail, sendOrderConfirmationEmail } from './resend';
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

/** eSIM attached: deliver the QR code the confirmation email promised. */
export async function announceEsimReady(order: EsimOrder): Promise<void> {
  await fanOut(order, [['email', sendEsimReadyEmail(order)]]);
}
