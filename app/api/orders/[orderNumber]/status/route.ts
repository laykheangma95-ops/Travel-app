// GET /api/orders/:orderNumber/status — what happened to one order.
//
// WHY THIS EXISTS:
//   /order-confirmation/[id] was entirely static. It printed whatever string
//   was in the URL and declared "Your eSIM is Being Prepared!" — for a real
//   order, a declined card, a cancelled ABA session, or a number typed by hand.
//   A customer whose payment failed was congratulated on it.
//
// WHAT IT DELIBERATELY DOES NOT RETURN:
//   Nothing that identifies the customer, and nothing that is worth stealing:
//   no name, no email, no phone, no device, no notes, and above all no
//   qr_code_url, esim_iccid or esim_activation_code. Those reach the buyer by
//   email and Telegram (docs/DELIVERY.md) and must not become fetchable by
//   anyone holding an order number.
//
//   That restraint is not optional here. `generateOrderNumber` (lib/utils.ts)
//   produces DN-<year>-<4 random digits> — 9,000 possibilities per year — so an
//   order number is guessable, and this endpoint must stay safe under the
//   assumption that someone will guess one. What a successful guess reveals is
//   a plan name and a price. The `checkout` rate limit (5/min) makes sweeping
//   the space take well over a day.
//
//   Widening this response is a decision about that trade-off, not a detail.
//   The signed-in customer's own orders, with everything on them, are already
//   served by /api/orders.

import { ApiError, ok, requireParam, route } from '@/lib/http';
import { getOrderWithItems } from '@/lib/orders';
import { ordersPersistenceAvailable } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Matches generateOrderNumber(): DN-<4-digit year>-<4 digits>. */
const ORDER_NUMBER = /^DN-\d{4}-\d{4}$/;

export interface OrderStatusLine {
  countryName: string;
  planName: string;
  quantity: number;
  durationDays: number;
}

export interface OrderStatusPayload {
  orderNumber: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
  createdAt: string | null;
  totalUsd: number;
  paymentMethod: 'stripe' | 'aba' | null;
  lines: OrderStatusLine[];
}

export const GET = route(
  async (_request, context) => {
    const orderNumber = requireParam(context, 'orderNumber').toUpperCase();

    // Reject anything that is not shaped like an order number before it reaches
    // the database, so this cannot be used as a general query surface.
    if (!ORDER_NUMBER.test(orderNumber)) {
      throw new ApiError('NOT_FOUND', 'We have no record of that order number.');
    }

    if (!ordersPersistenceAvailable()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Order lookup is unavailable right now.');
    }

    const order = await getOrderWithItems(orderNumber);
    if (!order) throw new ApiError('NOT_FOUND', 'We have no record of that order number.');

    const lines: OrderStatusLine[] = (order.items ?? []).map((item) => ({
      countryName: item.country_name,
      planName: item.plan_name,
      quantity: Number(item.quantity ?? 1),
      durationDays: Number(item.duration_days ?? 0),
    }));

    // An order written before order_items existed still has its denormalized
    // summary columns, so it renders as one line rather than none.
    if (lines.length === 0) {
      lines.push({
        countryName: order.country,
        planName: order.plan_name,
        quantity: 1,
        durationDays: Number(order.duration_days ?? 0),
      });
    }

    const payload: OrderStatusPayload = {
      orderNumber: order.order_number,
      status: order.status,
      createdAt: order.created_at ?? null,
      totalUsd: Number(order.price_usd ?? 0),
      paymentMethod: (order.payment_method as OrderStatusPayload['paymentMethod']) ?? null,
      lines,
    };

    return ok(payload);
  },
  { rateLimit: 'checkout', name: 'orders.status' }
);
