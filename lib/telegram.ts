// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { createHash, randomBytes } from 'crypto';
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

// ─── Customer-facing delivery ────────────────────────────────────────────────
//
// Important constraint: a Telegram bot CANNOT start a conversation with a user
// from a phone number. There is no such API — Telegram requires the user to
// message the bot first, and only then does the bot learn their chat_id. So
// the phone number a customer types at checkout is used for *matching and
// support*, never as an address. Delivery works like this:
//
//   1. Order is paid → we mint a single-use token and store its hash.
//   2. Confirmation page shows https://t.me/<bot>?start=<token> as a button
//      and a QR (for people paying on desktop but reading Telegram on phone).
//   3. Customer taps Start → our webhook receives "/start <token>", resolves
//      it to the order, records the chat_id, and pushes the eSIM QR.
//
// Email always goes out regardless, so the QR is never trapped behind a step
// the customer might not complete.

const TELEGRAM_API = 'https://api.telegram.org';

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

/** Raw token for the deep link; only its hash is ever stored. */
export function createConnectToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashConnectToken(token) };
}

export function hashConnectToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function connectUrl(token: string): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username.replace(/^@/, '')}?start=${token}`;
}

async function callBot(method: string, payload: unknown): Promise<boolean> {
  const token = botToken();
  if (!token) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  return callBot('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

/**
 * Push the eSIM QR to a connected chat. Sent as a photo so the customer can
 * scan it from a second device, followed by the install steps as text they can
 * still read with no data.
 */
export async function sendEsimQrToChat(chatId: number | string, order: EsimOrder): Promise<boolean> {
  if (!order.qr_code_url) return false;

  const caption = [
    `📶 <b>Your Domer eSIM is ready</b>`,
    `Order: <code>${order.order_number}</code>`,
    `${order.country} — ${order.plan_name}`,
    `${order.duration_days} days · ${order.data_gb_daily}GB/day`,
  ].join('\n');

  const photoSent = await callBot('sendPhoto', {
    chat_id: chatId,
    photo: order.qr_code_url,
    caption,
    parse_mode: 'HTML',
  });
  if (!photoSent) return false;

  await sendTelegramMessage(
    chatId,
    [
      '<b>How to install</b>',
      '1. Settings → Mobile Service → Add eSIM',
      '2. Scan this QR from another screen, or save it and choose the photo',
      '3. Label it "Domer" and keep your home SIM as primary',
      '4. Turn data roaming ON for the Domer line once you land',
      '',
      'Install before you fly — you need wi-fi or data to add an eSIM.',
      'Stuck? Reply here and a Khmer-speaking agent will help. 🇰🇭',
    ].join('\n')
  );
  return true;
}

/** Prompt shown the moment a customer opens the bot with a valid token. */
export async function askForContact(chatId: number | string): Promise<boolean> {
  return callBot('sendMessage', {
    chat_id: chatId,
    text: 'Tap the button below to confirm this is your number, and your eSIM QR will arrive here.',
    reply_markup: {
      keyboard: [[{ text: '📱 Share my number', request_contact: true }]],
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  });
}
