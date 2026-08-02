import { log } from './logger';
import type { EsimOrder } from '@/types';

/**
 * Admin notifications to the Domer ops Telegram channel.
 *
 * Money is coerced with Number() before formatting — PostgREST may return a
 * DECIMAL column as a string, and calling .toFixed() on it throws.
 */
function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

async function sendTelegram(text: string, tag: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) log.warn('telegram.send_failed', { tag, status: res.status });
    return res.ok;
  } catch (error) {
    log.warn('telegram.send_error', { tag, error });
    return false;
  }
}

export async function notifyAdminNewOrder(order: EsimOrder): Promise<boolean> {
  const text = [
    '🛒 New eSIM order — payment settled',
    `Order: ${order.order_number}`,
    `Country: ${order.country}`,
    `Plan: ${order.plan_name} (${order.duration_days}d, ${order.data_gb_daily}GB/day)`,
    `Total: $${money(order.price_usd)}`,
    order.discount_code ? `Promo: ${order.discount_code}` : null,
    order.referral_code ? `Referral: ${order.referral_code}` : null,
    `Customer: ${order.customer_name ?? '—'} (${order.customer_email ?? '—'})`,
    `Phone: ${order.customer_phone ?? '—'}`,
    `Device: ${order.device_type ?? '—'}`,
    `Payment: ${order.payment_method ?? '—'}`,
    '',
    '→ Fulfil at /admin/orders',
  ]
    .filter(Boolean)
    .join('\n');

  return sendTelegram(text, 'new_order');
}

/**
 * Automatic provisioning could not deliver — a human needs to act.
 * This is the highest-priority alert in the system: money has been taken and
 * the customer has nothing yet.
 */
export async function notifyAdminFulfilmentFailed(
  order: EsimOrder,
  reason: string
): Promise<boolean> {
  return sendTelegram(
    [
      '🚨 MANUAL FULFILMENT NEEDED',
      `Order: ${order.order_number}`,
      `Reason: ${reason}`,
      '',
      `${order.country} · ${order.plan_name}`,
      `Paid: $${money(order.price_usd)}`,
      `Customer: ${order.customer_email ?? '—'}`,
      '',
      'The customer has paid and is waiting. Deliver at /admin/orders.',
    ].join('\n'),
    'fulfilment_failed'
  );
}

/** Warns ops when an order has been paid but not fulfilled for too long. */
export async function notifyAdminStaleOrder(order: EsimOrder, ageMinutes: number): Promise<boolean> {
  return sendTelegram(
    [
      '⚠️ Order awaiting fulfilment',
      `Order: ${order.order_number}`,
      `Paid ${ageMinutes} minutes ago and still not delivered.`,
      `Customer: ${order.customer_email ?? '—'}`,
    ].join('\n'),
    'stale_order'
  );
}
