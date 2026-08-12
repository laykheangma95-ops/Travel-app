// ─────────────────────────────────────────────────────────────────────────────
// Supplier control panel API.
//
//   GET   /api/admin/providers — who is registered, configured, in rotation,
//                                healthy, and what coverage they have
//   POST  /api/admin/providers — retry automatic fulfilment for a paid order
//
// The retry endpoint is what makes supplier failover operationally real: when a
// supplier recovers, ops re-run the queue instead of pasting QR codes by hand.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/serverAuth';
import { getOrderByNumber } from '@/lib/orders';
import { fulfilOrder } from '@/lib/fulfilment';
import { checkAllProviders, providerStatus } from '@/lib/providers/esim/registry';
import { coverageFor } from '@/lib/providers/esim/skuMap';
import { availablePaymentProviders } from '@/lib/providers/payments/registry';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    await requirePermission(request, 'suppliers.manage');

    const [health, status] = await Promise.all([checkAllProviders(), providerStatus()]);

    const esim = status.map((provider) => ({
      ...provider,
      coveredPlans: coverageFor(provider.id).length,
      health: health.find((h) => h.providerId === provider.id) ?? null,
    }));

    return ok({ esim, payments: availablePaymentProviders() });
  },
  { name: 'admin.providers.status' }
);

const retrySchema = z.object({
  orderNumber: z.string().trim().min(3).max(64),
});

export const POST = route(
  async (request) => {
    const { user: admin } = await requirePermission(request, 'suppliers.manage');
    const parsed = retrySchema.safeParse(await readJson<unknown>(request));

    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'Provide the order number to retry.');
    }

    const order = await getOrderByNumber(parsed.data.orderNumber);
    if (!order) {
      throw new ApiError('NOT_FOUND', 'That order does not exist.');
    }

    // Only a paid-but-undelivered order can be retried. Retrying a fulfilled
    // order would buy a second eSIM at our own cost.
    if (order.status !== 'paid') {
      throw new ApiError(
        'BAD_REQUEST',
        `Only paid orders awaiting delivery can be retried — this one is ${order.status}.`
      );
    }

    log.info('admin.fulfilment_retry', {
      orderNumber: order.order_number,
      by: admin.email,
    });

    const result = await fulfilOrder(order);
    return ok({ result });
  },
  { name: 'admin.providers.retry' }
);
