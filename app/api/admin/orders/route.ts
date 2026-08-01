// ─────────────────────────────────────────────────────────────────────────────
// Admin orders API.
//
//   GET   /api/admin/orders           — list real orders (filter, search, page)
//   PATCH /api/admin/orders           — fulfil an order (attach eSIM details)
//
// Every handler calls requireAdmin() itself. There is no shared "the layout
// already checked" assumption, because the layout runs in the browser and the
// browser is not a security boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { announceEsimReady } from '@/lib/orderNotifications';
import { listOrders, orderStats, transitionOrder } from '@/lib/orders';
import { log } from '@/lib/logger';
import type { OrderStatus } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: Array<OrderStatus | 'all'> = [
  'all',
  'pending',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
];

export const GET = route(
  async (request) => {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') ?? 'all';
    const status = (STATUSES as string[]).includes(statusParam)
      ? (statusParam as OrderStatus | 'all')
      : 'all';

    const [{ orders, total }, stats] = await Promise.all([
      listOrders({
        status,
        search: searchParams.get('search') ?? undefined,
        limit: Number(searchParams.get('limit') ?? 50),
        offset: Number(searchParams.get('offset') ?? 0),
      }),
      // Skipped on paginated requests — the tiles only need computing once.
      searchParams.get('offset') ? Promise.resolve(null) : orderStats(),
    ]);

    return ok({ orders, total, stats });
  },
  { name: 'admin.orders.list' }
);

const fulfilSchema = z.object({
  orderNumber: z.string().trim().min(3).max(64),
  qrCodeUrl: z.string().trim().url('The QR code must be a valid URL.').max(2048).optional(),
  iccid: z.string().trim().max(32).optional(),
  activationCode: z.string().trim().max(256).optional(),
  providerName: z.string().trim().max(64).optional(),
  providerOrderId: z.string().trim().max(128).optional(),
  /** Set to 'cancelled' or 'refunded' to close an order instead of fulfilling it. */
  status: z.enum(['fulfilled', 'cancelled', 'refunded']).default('fulfilled'),
});

export const PATCH = route(
  async (request) => {
    const admin = await requireAdmin(request);
    const body = await readJson<unknown>(request);

    const parsed = fulfilSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid fulfilment payload.', {
        field: issue?.path.join('.'),
      });
    }

    const input = parsed.data;

    // Fulfilling an order means the customer can install the eSIM, so the
    // delivery details have to actually be there.
    if (input.status === 'fulfilled' && !input.qrCodeUrl && !input.activationCode) {
      throw new ApiError(
        'BAD_REQUEST',
        'Attach a QR code URL or an activation code before marking an order fulfilled.'
      );
    }

    const result = await transitionOrder(input.orderNumber, input.status, {
      actor: admin.email ?? admin.id,
      patch: {
        qr_code_url: input.qrCodeUrl ?? null,
        esim_iccid: input.iccid ?? null,
        esim_activation_code: input.activationCode ?? null,
        provider_name: input.providerName ?? null,
        provider_order_id: input.providerOrderId ?? null,
      },
      detail: { by: admin.email, provider: input.providerName ?? null },
    });

    if (result.changed && input.status === 'fulfilled') {
      await announceEsimReady(result.order);
    }

    if (!result.changed) {
      log.info('admin.fulfil_noop', {
        orderNumber: input.orderNumber,
        status: result.order.status,
      });
    }

    return ok({ order: result.order, changed: result.changed });
  },
  { name: 'admin.orders.fulfil' }
);
