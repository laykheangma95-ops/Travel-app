import type { EsimOrder } from '@/types';

// Sends admin notifications to the Domer ops Telegram channel via bot API.
export async function notifyAdminNewOrder(order: EsimOrder): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return false;

  const text = [
    '🛒 New eSIM order!',
    `Order: ${order.order_number}`,
    `Country: ${order.country}`,
    `Plan: ${order.plan_name} (${order.duration_days}d, ${order.data_gb_daily}GB/day)`,
    `Total: $${order.price_usd.toFixed(2)}`,
    `Customer: ${order.customer_name ?? '—'} (${order.customer_email ?? '—'})`,
    `Phone: ${order.customer_phone ?? '—'}`,
    `Device: ${order.device_type ?? '—'}`,
    `Payment: ${order.payment_method ?? '—'}`,
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
