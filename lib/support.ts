// ─────────────────────────────────────────────────────────────────────────────
// Call-centre lookup.
//
// One customer is on the phone. Staff need their order in front of them in a
// couple of seconds: what they bought, whether the money landed, whether the
// eSIM went out, and what has happened to it since.
//
// WHY THIS IS EXACT-MATCH ONLY
//
//   The obvious build is a search box that does `ilike %term%`. That is also a
//   customer-enumeration tool: type "@gmail" and read back the contact dataset
//   a page at a time. docs/LOCKED.md is explicit that the realistic leak path
//   is a helpful new endpoint, and that bulk access to customer contact data
//   needs the owner's sign-off.
//
//   So this resolves an identifier the caller already knows — a full order
//   number, a full email address, or a full phone number — and returns at most
//   the orders belonging to that one person. A partial string returns nothing.
//   Staff lose nothing: on a support call you always have one of the three.
//
//   The existing /admin/orders list keeps its substring search. That is a
//   deliberate separation: browsing is an admin activity, and this console is
//   designed so it can later be handed to call-centre staff on a lower role
//   without also handing over the customer list.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase';
import { ApiError } from '@/lib/http';
import { log, redactEmail } from '@/lib/logger';
import type { EsimOrder, OrderStatus } from '@/types';

export type LookupKind = 'order_number' | 'email' | 'phone';

export interface SupportTimelineEntry {
  eventType: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actor: string | null;
  createdAt: string;
}

export interface SupportDeliveryAttempt {
  channel: string;
  succeeded: boolean;
  error: string | null;
  createdAt: string;
}

export interface SupportOrderView {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;

  planSummary: string;
  country: string;
  durationDays: number;
  items: Array<{ planName: string; countryName: string; quantity: number }>;

  totalUsd: number;
  currency: string;
  paymentMethod: string | null;

  customerName: string | null;
  /** Masked: 'j••••@gmail.com'. Enough to confirm identity, not to harvest. */
  customerEmailMasked: string | null;
  customerPhoneMasked: string | null;

  /** Whether an eSIM exists at all, and its identifiers — never the full LPA. */
  esimIssued: boolean;
  iccidLast4: string | null;
  hasQrCode: boolean;
  providerName: string | null;
  providerOrderId: string | null;

  deliveryChannel: string | null;
  deliveredEmailAt: string | null;
  deliveredTelegramAt: string | null;
  deliveryAttempts: SupportDeliveryAttempt[];

  timeline: SupportTimelineEntry[];

  /** Plain-language read of what is wrong, for staff who are not engineers. */
  diagnosis: string;
  /** What to do about it. */
  nextAction: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SHAPE = /^\+?[0-9][0-9\s-]{5,19}$/;

/** Decides what the operator typed, so they get one box instead of three. */
export function classifyQuery(raw: string): { kind: LookupKind; value: string } | null {
  const term = raw.trim();
  if (term.length < 3) return null;

  if (EMAIL_SHAPE.test(term)) {
    return { kind: 'email', value: term.toLowerCase() };
  }

  if (PHONE_SHAPE.test(term)) {
    // Store is E.164; normalise away the spacing people read out loud.
    return { kind: 'phone', value: term.replace(/[\s-]/g, '') };
  }

  return { kind: 'order_number', value: term.toUpperCase() };
}

/** 'jane@gmail.com' → 'j•••@gmail.com'. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/** '+855123456789' → '+855•••••6789'. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 4) return '•'.repeat(phone.length);
  const head = phone.startsWith('+') ? phone.slice(0, 4) : phone.slice(0, 2);
  const tail = phone.slice(-4);
  return `${head}${'•'.repeat(Math.max(phone.length - head.length - 4, 1))}${tail}`;
}

/**
 * Turns order state into something a call-centre operator can read out.
 *
 * This is the part that makes the console useful under time pressure: the
 * operator should not have to know that `paid` with no `fulfilled_at` and an
 * age over five minutes means the supplier handover is stuck.
 */
export function diagnose(order: EsimOrder, now = Date.now()): { diagnosis: string; nextAction: string } {
  const ageMinutes = (now - new Date(order.created_at).getTime()) / 60_000;
  const hasEsim = Boolean(order.esim_iccid || order.qr_code_url || order.esim_activation_code);

  switch (order.status) {
    case 'pending':
      return ageMinutes > 30
        ? {
            diagnosis: 'Payment was never completed — the customer started checkout but did not pay.',
            nextAction: 'Ask them to place the order again. Nothing was charged.',
          }
        : {
            diagnosis: 'Checkout is in progress; payment has not landed yet.',
            nextAction: 'Wait a moment and refresh. If their card was charged, escalate with the order number.',
          };

    case 'paid':
      if (hasEsim) {
        return {
          diagnosis: 'Paid, and an eSIM exists, but the order was never marked fulfilled.',
          nextAction: 'Mark it fulfilled in Orders — this also re-sends the QR.',
        };
      }
      return ageMinutes > 5
        ? {
            diagnosis: 'Paid, but the supplier has not returned an eSIM. This order is stuck.',
            nextAction: 'Escalate now. The customer has paid and has nothing — this is a refund risk.',
          }
        : {
            diagnosis: 'Paid moments ago; the eSIM is still being issued.',
            nextAction: 'Ask the customer to wait two minutes, then refresh.',
          };

    case 'fulfilled':
      if (!order.delivered_email_at && !order.delivered_telegram_at) {
        return {
          diagnosis: 'The eSIM was issued but we have no record of it reaching the customer.',
          nextAction: 'Re-send the QR from Orders, and confirm their email address is right.',
        };
      }
      return {
        diagnosis: 'Complete. The eSIM was issued and delivered.',
        nextAction: 'If they cannot install it, check that the device is eSIM-capable and unlocked.',
      };

    case 'cancelled':
      return {
        diagnosis: 'This order was cancelled.',
        nextAction: 'No money is outstanding. Offer to place a new order.',
      };

    case 'refunded':
      return {
        diagnosis: 'This order was refunded.',
        nextAction: 'Refunds take 5–10 working days to appear on the customer’s statement.',
      };

    default:
      return { diagnosis: 'Unknown order state.', nextAction: 'Escalate with the order number.' };
  }
}

interface RawRow extends EsimOrder {
  items: Array<{ plan_name: string; country_name: string; quantity: number }> | null;
}

function toView(
  order: RawRow,
  timeline: SupportTimelineEntry[],
  deliveries: SupportDeliveryAttempt[]
): SupportOrderView {
  const { diagnosis, nextAction } = diagnose(order);

  return {
    orderNumber: order.order_number,
    status: order.status,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    fulfilledAt: order.fulfilled_at,

    planSummary: order.plan_name,
    country: order.country,
    durationDays: order.duration_days,
    items: (order.items ?? []).map((item) => ({
      planName: item.plan_name,
      countryName: item.country_name,
      quantity: item.quantity,
    })),

    totalUsd: Number(order.price_usd) || 0,
    currency: order.currency,
    paymentMethod: order.payment_method,

    customerName: order.customer_name,
    customerEmailMasked: maskEmail(order.customer_email),
    customerPhoneMasked: maskPhone(order.customer_phone),

    esimIssued: Boolean(order.esim_iccid || order.qr_code_url || order.esim_activation_code),
    // Last four only. The full ICCID plus the activation code is enough to
    // install the SIM, and a support console is the wrong place to keep both.
    iccidLast4: order.esim_iccid ? order.esim_iccid.slice(-4) : null,
    hasQrCode: Boolean(order.qr_code_url),
    providerName: order.provider_name,
    providerOrderId: order.provider_order_id,

    deliveryChannel: order.delivery_channel ?? null,
    deliveredEmailAt: order.delivered_email_at ?? null,
    deliveredTelegramAt: order.delivered_telegram_at ?? null,
    deliveryAttempts: deliveries,

    timeline,
    diagnosis,
    nextAction,
  };
}

/**
 * Resolves one identifier to that customer's orders.
 *
 * Returns [] rather than throwing when nothing matches — "no order with that
 * number" is a normal answer on a support call, not an error.
 */
export async function lookupOrders(rawQuery: string, actor: string): Promise<SupportOrderView[]> {
  const classified = classifyQuery(rawQuery);
  if (!classified) {
    throw new ApiError(
      'BAD_REQUEST',
      'Enter a full order number, email address, or phone number. Partial searches are not supported.'
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Order storage is unavailable.');
  }

  const column =
    classified.kind === 'email'
      ? 'customer_email'
      : classified.kind === 'phone'
        ? 'customer_phone'
        : 'order_number';

  const { data, error } = await supabase
    .from('esim_orders')
    .select('*, items:order_items(plan_name, country_name, quantity)')
    // .eq(), never .ilike() — see the note at the top of this file.
    .eq(column, classified.value)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    log.error('support.lookup_failed', { kind: classified.kind, error });
    throw new ApiError('INTERNAL', 'Could not look that up. Please try again.');
  }

  const orders = (data ?? []) as RawRow[];

  log.info('support.lookup', {
    actor,
    kind: classified.kind,
    // The identifier searched for is itself contact data — redact it.
    term: classified.kind === 'email' ? redactEmail(classified.value) : classified.kind,
    results: orders.length,
  });

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const orderNumbers = orders.map((order) => order.order_number);

  const [eventsResult, deliveriesResult] = await Promise.all([
    supabase
      .from('order_events')
      .select('order_id, event_type, from_status, to_status, actor, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('esim_deliveries')
      .select('order_number, channel, succeeded, error, created_at')
      .in('order_number', orderNumbers)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const eventsByOrder = new Map<string, SupportTimelineEntry[]>();
  for (const event of (eventsResult.data ?? []) as Array<Record<string, string | null>>) {
    const id = event.order_id as string;
    const list = eventsByOrder.get(id) ?? [];
    list.push({
      eventType: event.event_type as string,
      fromStatus: event.from_status as OrderStatus | null,
      toStatus: event.to_status as OrderStatus | null,
      actor: event.actor,
      createdAt: event.created_at as string,
    });
    eventsByOrder.set(id, list);
  }

  const deliveriesByOrder = new Map<string, SupportDeliveryAttempt[]>();
  for (const attempt of (deliveriesResult.data ?? []) as Array<Record<string, unknown>>) {
    const number = attempt.order_number as string;
    const list = deliveriesByOrder.get(number) ?? [];
    list.push({
      channel: attempt.channel as string,
      succeeded: Boolean(attempt.succeeded),
      error: (attempt.error as string | null) ?? null,
      createdAt: attempt.created_at as string,
    });
    deliveriesByOrder.set(number, list);
  }

  return orders.map((order) =>
    toView(order, eventsByOrder.get(order.id) ?? [], deliveriesByOrder.get(order.order_number) ?? [])
  );
}
