// ─────────────────────────────────────────────────────────────────────────────
// Order repository — every read and write of an order goes through here.
//
// WHY THIS EXISTS:
//   Order rows used to be assembled inline inside each payment route, with the
//   money taken from the request body and no user_id attached. The result was
//   an order nobody owned, priced by the buyer, with no line items and no audit
//   trail — unusable for support, reconciliation or an eSIM supplier handover.
//
//   This module is the only place that writes to esim_orders. Status changes go
//   through explicit transitions so a webhook that fires twice cannot send two
//   confirmation emails or double-count affiliate commission.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from './supabase';
import { log, redactEmail } from './logger';
import { logSupabaseError } from './supabaseError';
import { ApiError } from './http';
import type { PricedOrder } from './pricing';
import type { DeliveryChannel, EsimOrder, OrderStatus, PaymentMethod } from '@/types';

export interface CustomerDetails {
  fullName: string;
  email: string;
  phone: string;
  contactMethod?: string;
  deviceType: string;
  notes?: string | null;
  /**
   * Where the customer wants the QR. Carried through the order pipeline so the
   * delivery contract in docs/LOCKED.md survives: email always goes out, and a
   * non-email choice additionally mints a Telegram connect link.
   */
  deliveryChannel?: DeliveryChannel;
  /** Dialling country for the phone number, stored alongside the E.164 value. */
  phoneCountry?: string | null;
}

export interface CreateOrderInput {
  orderNumber: string;
  priced: PricedOrder;
  customer: CustomerDetails;
  paymentMethod: PaymentMethod;
  /** Set when the buyer was signed in; null for guest checkout. */
  userId: string | null;
  /** Stable per checkout attempt, so a double-submit reuses the first order. */
  idempotencyKey: string;
  /** Marks the row as a development-mode order that never took real money. */
  demo: boolean;
}

/** Which status changes are legal. Anything else is a bug or a replayed webhook. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'cancelled'],
  fulfilled: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function requireDb() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Order storage is unavailable. Please try again.');
  }
  return supabase;
}

/** True when Supabase is configured. Callers use this to degrade gracefully in dev. */
export function ordersPersistenceAvailable(): boolean {
  return getSupabaseAdmin() !== null;
}

/**
 * Creates a pending order together with its line items.
 *
 * Idempotent: if the same idempotency key already produced an order, that order
 * is returned untouched rather than a second one being created.
 */
export async function createOrder(input: CreateOrderInput): Promise<EsimOrder> {
  const supabase = requireDb();
  const { priced, customer } = input;

  const existing = await supabase
    .from('esim_orders')
    .select('*')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (existing.data) {
    log.info('order.idempotent_replay', {
      orderNumber: (existing.data as EsimOrder).order_number,
    });
    return existing.data as EsimOrder;
  }

  const first = priced.lines[0];

  const { data, error } = await supabase
    .from('esim_orders')
    .insert({
      user_id: input.userId,
      order_number: input.orderNumber,
      country: priced.countrySummary,
      plan_name: priced.planSummary,
      duration_days: first.durationDays,
      data_gb_daily: first.dataGbDaily,
      subtotal_usd: priced.subtotalUsd,
      discount_usd: priced.discountUsd,
      price_usd: priced.totalUsd,
      currency: 'USD',
      discount_code: priced.appliedDiscountCode,
      referral_code: priced.appliedReferralCode,
      status: 'pending',
      payment_method: input.paymentMethod,
      idempotency_key: input.idempotencyKey,
      customer_name: customer.fullName,
      customer_email: customer.email.trim().toLowerCase(),
      customer_phone: customer.phone,
      device_type: customer.deviceType,
      notes: customer.notes ?? null,
      delivery_channel: customer.deliveryChannel ?? 'email',
      customer_phone_country: customer.phoneCountry ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    logSupabaseError('order.create_failed', error, { orderNumber: input.orderNumber });
    throw new ApiError('INTERNAL', 'We could not start your order. Please try again.');
  }

  const order = data as EsimOrder;

  const items = priced.lines.map((line) => ({
    order_id: order.id,
    plan_id: line.planId,
    country_slug: line.countrySlug,
    country_name: line.countryName,
    plan_name: line.planName,
    tier: line.tier,
    duration_days: line.durationDays,
    data_gb_daily: line.dataGbDaily,
    unit_price_usd: line.unitPriceUsd,
    quantity: line.quantity,
    line_total_usd: line.lineTotalUsd,
  }));

  const itemsResult = await supabase.from('order_items').insert(items);
  if (itemsResult.error) {
    // The order exists but its breakdown does not — loud, because support and
    // the supplier handover both depend on the line items.
    logSupabaseError('order.items_insert_failed', itemsResult.error, {
      orderNumber: order.order_number,
    });
  }

  await recordEvent(order.id, {
    eventType: 'order.created',
    toStatus: 'pending',
    actor: input.userId ?? 'guest',
    detail: {
      demo: input.demo,
      subtotalUsd: priced.subtotalUsd,
      discountUsd: priced.discountUsd,
      totalUsd: priced.totalUsd,
      lines: priced.lines.length,
    },
  });

  log.info('order.created', {
    orderNumber: order.order_number,
    totalUsd: priced.totalUsd,
    method: input.paymentMethod,
    email: redactEmail(customer.email),
    demo: input.demo,
  });

  return order;
}

export interface TransitionResult {
  order: EsimOrder;
  /** False when the order was already in the target state (replayed webhook). */
  changed: boolean;
}

/**
 * Moves an order to a new status, refusing illegal jumps and no-op replays.
 *
 * The `changed` flag is what callers gate side effects on: a Stripe webhook
 * delivered three times must send exactly one confirmation email.
 */
export async function transitionOrder(
  orderNumber: string,
  to: OrderStatus,
  opts: {
    actor: string;
    patch?: Record<string, unknown>;
    detail?: Record<string, unknown>;
  }
): Promise<TransitionResult> {
  const supabase = requireDb();

  const { data: current, error: readError } = await supabase
    .from('esim_orders')
    .select('*')
    .eq('order_number', orderNumber)
    .maybeSingle();

  // A failed read and a genuinely absent order both arrive here as `!current`.
  // Reporting the first as "not found" tells a webhook the order never existed —
  // so it stops retrying, and a paid order stays pending forever.
  if (readError) {
    logSupabaseError('order.transition_read_failed', readError, { orderNumber, to });
    throw new ApiError('INTERNAL', 'We could not read the order. Please try again.');
  }

  if (!current) {
    throw new ApiError('NOT_FOUND', `Order ${orderNumber} was not found.`);
  }

  const order = current as EsimOrder;
  const from = order.status;

  if (from === to) {
    log.info('order.transition_noop', { orderNumber, status: to, actor: opts.actor });
    return { order, changed: false };
  }

  if (!canTransition(from, to)) {
    log.warn('order.transition_rejected', { orderNumber, from, to, actor: opts.actor });
    throw new ApiError('BAD_REQUEST', `An order that is ${from} cannot become ${to}.`);
  }

  const patch: Record<string, unknown> = { status: to, ...opts.patch };
  if (to === 'paid') patch.paid_at = new Date().toISOString();
  if (to === 'fulfilled') patch.fulfilled_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('esim_orders')
    // Compare-and-set: if a concurrent webhook already moved the row, this
    // matches nothing and we do not double-apply the side effects.
    .update(patch)
    .eq('order_number', orderNumber)
    .eq('status', from)
    .select('*')
    .maybeSingle();

  if (error) {
    logSupabaseError('order.transition_failed', error, { orderNumber, from, to });
    throw new ApiError('INTERNAL', 'We could not update the order. Please try again.');
  }

  if (!updated) {
    log.info('order.transition_lost_race', { orderNumber, from, to });
    return { order, changed: false };
  }

  await recordEvent(order.id, {
    eventType: `order.${to}`,
    fromStatus: from,
    toStatus: to,
    actor: opts.actor,
    detail: opts.detail,
  });

  log.info('order.transitioned', { orderNumber, from, to, actor: opts.actor });
  return { order: updated as EsimOrder, changed: true };
}

async function recordEvent(
  orderId: string,
  event: {
    eventType: string;
    fromStatus?: OrderStatus;
    toStatus?: OrderStatus;
    actor: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: event.eventType,
    from_status: event.fromStatus ?? null,
    to_status: event.toStatus ?? null,
    actor: event.actor,
    detail: event.detail ?? null,
  });

  // The audit trail must never break the customer's checkout.
  if (error) logSupabaseError('order.event_write_failed', error, { orderId });
}

export async function getOrderByNumber(orderNumber: string): Promise<EsimOrder | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('esim_orders')
    .select('*')
    .eq('order_number', orderNumber)
    .maybeSingle();

  // Callers read this as "no such order". Keep that contract, but leave a trail
  // when the null came from a broken query instead of an empty table.
  if (error) logSupabaseError('order.read_failed', error, { orderNumber });

  return (data as EsimOrder | null) ?? null;
}

export interface OrderWithItems extends EsimOrder {
  items: Array<{
    plan_id: string;
    country_name: string;
    plan_name: string;
    quantity: number;
    unit_price_usd: number;
    line_total_usd: number;
    duration_days: number;
    data_gb_daily: number;
  }>;
}

export async function getOrderWithItems(orderNumber: string): Promise<OrderWithItems | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('esim_orders')
    .select('*, items:order_items(*)')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) logSupabaseError('order.read_with_items_failed', error, { orderNumber });

  return (data as OrderWithItems | null) ?? null;
}

export interface ListOrdersParams {
  status?: OrderStatus | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}

/** Admin order list. Callers must have passed requireAdmin() first. */
export async function listOrders(
  params: ListOrdersParams = {}
): Promise<{ orders: OrderWithItems[]; total: number }> {
  const supabase = requireDb();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = supabase
    .from('esim_orders')
    .select('*, items:order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  if (params.search?.trim()) {
    const term = params.search.trim();
    // Escape PostgREST's or() delimiters so a search string cannot alter the filter.
    const safe = term.replace(/[,()]/g, ' ');
    query = query.or(
      `order_number.ilike.%${safe}%,customer_email.ilike.%${safe}%,customer_name.ilike.%${safe}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    logSupabaseError('order.list_failed', error);
    throw new ApiError('INTERNAL', 'Could not load orders.');
  }

  return { orders: (data as OrderWithItems[]) ?? [], total: count ?? 0 };
}

/** Orders belonging to one signed-in customer, matched by id or checkout email. */
export async function listOrdersForUser(
  userId: string,
  email: string | null
): Promise<OrderWithItems[]> {
  const supabase = requireDb();

  const filters = [`user_id.eq.${userId}`];
  if (email) filters.push(`customer_email.eq.${email.trim().toLowerCase()}`);

  const { data, error } = await supabase
    .from('esim_orders')
    .select('*, items:order_items(*)')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    logSupabaseError('order.list_user_failed', error, { userId });
    throw new ApiError('INTERNAL', 'Could not load your orders.');
  }

  return (data as OrderWithItems[]) ?? [];
}

/** Counts by status, for the admin dashboard tiles. */
export async function orderStats(): Promise<{
  total: number;
  byStatus: Record<OrderStatus, number>;
  revenueUsd: number;
  last7dRevenueUsd: number;
}> {
  const supabase = requireDb();

  const { data, error } = await supabase
    .from('esim_orders')
    .select('status, price_usd, created_at')
    .limit(10_000);

  if (error) {
    logSupabaseError('order.stats_failed', error);
    throw new ApiError('INTERNAL', 'Could not load order statistics.');
  }

  const byStatus: Record<OrderStatus, number> = {
    pending: 0,
    paid: 0,
    fulfilled: 0,
    cancelled: 0,
    refunded: 0,
  };

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let revenueUsd = 0;
  let last7dRevenueUsd = 0;

  for (const row of (data ?? []) as Array<{
    status: OrderStatus;
    price_usd: number;
    created_at: string;
  }>) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    // Only settled money counts as revenue.
    if (row.status === 'paid' || row.status === 'fulfilled') {
      const amount = Number(row.price_usd) || 0;
      revenueUsd += amount;
      if (new Date(row.created_at).getTime() >= weekAgo) last7dRevenueUsd += amount;
    }
  }

  return {
    total: (data ?? []).length,
    byStatus,
    revenueUsd: Math.round(revenueUsd * 100) / 100,
    last7dRevenueUsd: Math.round(last7dRevenueUsd * 100) / 100,
  };
}
