// ─────────────────────────────────────────────────────────────────────────────
// Order fulfilment — the bridge between "paid" and "the customer has an eSIM".
//
// Called the moment a payment settles. It tries to provision automatically
// through the supplier registry, and falls back to the human ops queue when it
// cannot.
//
// THE RULE THAT MATTERS:
//   An order is only ever marked `fulfilled` when a real eSIM exists. If every
//   supplier is down, the order stays `paid`, ops are alerted, and it appears
//   in the admin queue for manual delivery. We never tell a customer their eSIM
//   is ready when it is not — that is the trust principle, in code.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from './logger';
import { getOrderWithItems, transitionOrder } from './orders';
import { announceEsimReady } from './orderNotifications';
import { notifyAdminFulfilmentFailed } from './telegramOps';
import { provisionWithFailover, type ProvisionAttempt } from './providers/esim/registry';
import type { EsimOrder } from '@/types';

export type FulfilmentResult =
  | { status: 'fulfilled'; providerId: string; attempts: ProvisionAttempt[] }
  | { status: 'manual'; reason: string; attempts: ProvisionAttempt[] };

/**
 * Attempts automatic fulfilment for a paid order.
 *
 * Never throws: it is called from payment webhooks, and a fulfilment problem
 * must not cause a gateway to retry a payment that already succeeded.
 */
export async function fulfilOrder(order: EsimOrder): Promise<FulfilmentResult> {
  try {
    const detailed = await getOrderWithItems(order.order_number);
    const firstItem = detailed?.items?.[0];

    if (!firstItem) {
      // No line items means we do not know what to buy. Straight to ops.
      log.error('fulfilment.no_line_items', { orderNumber: order.order_number });
      await queueForManualFulfilment(order, 'Order has no line items to provision.');
      return { status: 'manual', reason: 'no-line-items', attempts: [] };
    }

    // Multi-plan orders are provisioned one plan at a time by ops for now:
    // a partial failure across several suppliers needs a human decision about
    // what to refund, and quietly delivering half an order is worse than
    // delivering it late.
    if ((detailed?.items?.length ?? 0) > 1) {
      log.info('fulfilment.multi_item_manual', {
        orderNumber: order.order_number,
        items: detailed?.items?.length,
      });
      await queueForManualFulfilment(order, 'Multi-plan order — needs manual provisioning.');
      return { status: 'manual', reason: 'multi-item', attempts: [] };
    }

    const outcome = await provisionWithFailover({
      orderNumber: order.order_number,
      planId: firstItem.plan_id,
      countrySlug: firstItem.country_name,
      durationDays: firstItem.duration_days,
      dataGbDaily: Number(firstItem.data_gb_daily),
      quantity: firstItem.quantity,
      customerEmail: order.customer_email ?? '',
      // Derived from the order, so a retried fulfilment reuses the supplier's
      // idempotency and cannot buy a second eSIM.
      idempotencyKey: `fulfil:${order.order_number}`,
    });

    if (!outcome.ok) {
      const reason =
        outcome.reason === 'no-provider'
          ? 'No supplier is configured or has coverage for this plan.'
          : 'Every supplier failed to provision.';

      await queueForManualFulfilment(order, reason);
      return { status: 'manual', reason: outcome.reason, attempts: outcome.attempts };
    }

    const { esim } = outcome;

    const result = await transitionOrder(order.order_number, 'fulfilled', {
      actor: `provider:${esim.providerId}`,
      patch: {
        qr_code_url: esim.qrCodeUrl,
        esim_iccid: esim.iccid,
        esim_activation_code: esim.activationCode,
        provider_name: esim.providerId,
        provider_order_id: esim.providerOrderId,
      },
      detail: {
        attempts: outcome.attempts,
        smdpAddress: esim.smdpAddress,
      },
    });

    if (result.changed) {
      await announceEsimReady(result.order);
    }

    return { status: 'fulfilled', providerId: esim.providerId, attempts: outcome.attempts };
  } catch (error) {
    // Any unexpected error still leaves the customer's paid order safe and
    // visible to ops, rather than in limbo.
    log.error('fulfilment.unexpected_error', { orderNumber: order.order_number, error });
    await queueForManualFulfilment(order, 'Unexpected error during automatic fulfilment.');
    return { status: 'manual', reason: 'error', attempts: [] };
  }
}

/**
 * Leaves the order `paid` and alerts ops.
 *
 * Deliberately does NOT change the order status: `paid` already means "money
 * received, eSIM not yet delivered", which is exactly the truth, and it is what
 * the admin queue filters on.
 */
async function queueForManualFulfilment(order: EsimOrder, reason: string): Promise<void> {
  log.warn('fulfilment.manual_required', { orderNumber: order.order_number, reason });

  await notifyAdminFulfilmentFailed(order, reason).catch((error) =>
    log.warn('fulfilment.alert_failed', { orderNumber: order.order_number, error })
  );
}
