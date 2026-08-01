// ─────────────────────────────────────────────────────────────────────────────
// Transactional email.
//
// Two fixes baked in here:
//   1. Every interpolated value is HTML-escaped. Order fields include
//      customer-supplied text, and an unescaped `<` in a name would corrupt the
//      email at best and inject markup at worst.
//   2. Money is coerced with Number() before formatting. PostgREST can return a
//      DECIMAL column as a string, and `"9.99".toFixed(2)` throws — which would
//      have taken down the confirmation email for a real, paid order.
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from 'resend';
import { appUrl } from './env';
import { log, redactEmail } from './logger';
import type { EsimOrder } from '@/types';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

const FROM = process.env.RESEND_FROM ?? 'Domer <orders@domnerapp.com>';

/** Escapes text for safe interpolation into an HTML email body. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formats a money column that may arrive as a number or a string. */
function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function shell(bodyHtml: string): string {
  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
      <div style="background: #14263F; padding: 32px; border-radius: 16px 16px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">
          <span style="color: #E6CB8B;">Domer</span>
          <span style="color: #C69749; font-size: 11px; letter-spacing: 4px;">TRAVEL</span>
        </h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: 0; border-radius: 0 0 16px 16px;">
        ${bodyHtml}
        <p style="color: #475569; font-size: 14px; margin-top: 28px;">
          24/7 Khmer support — reply to this email or message us on Telegram.
        </p>
      </div>
    </div>`;
}

function orderTable(order: EsimOrder): string {
  const discount = Number(order.discount_usd) || 0;
  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 0; color: #475569;">Destination</td>
        <td style="text-align: right;">${esc(order.country)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #475569;">Plan</td>
        <td style="text-align: right;">
          ${esc(order.plan_name)} — ${esc(order.duration_days)} days, ${esc(order.data_gb_daily)}GB/day
        </td>
      </tr>
      ${
        discount > 0
          ? `<tr>
               <td style="padding: 8px 0; color: #475569;">Discount</td>
               <td style="text-align: right; color: #16A34A;">−$${money(discount)}</td>
             </tr>`
          : ''
      }
      <tr>
        <td style="padding: 8px 0; color: #475569;">Total</td>
        <td style="text-align: right;"><strong>$${money(order.price_usd)}</strong></td>
      </tr>
    </table>`;
}

async function send(to: string, subject: string, html: string, tag: string): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    log.warn('email.not_configured', { tag });
    return false;
  }

  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    log.info('email.sent', { tag, to: redactEmail(to) });
    return true;
  } catch (error) {
    log.error('email.send_failed', { tag, to: redactEmail(to), error });
    return false;
  }
}

/** Sent the moment payment settles. */
export async function sendOrderConfirmationEmail(order: EsimOrder): Promise<boolean> {
  if (!order.customer_email) return false;

  return send(
    order.customer_email,
    `Your Domer eSIM order ${order.order_number} is confirmed ✈️`,
    shell(`
      <h2 style="margin-top: 0;">Your eSIM is being prepared!</h2>
      <p>Order number: <strong style="font-family: monospace;">${esc(order.order_number)}</strong></p>
      ${orderTable(order)}
      <p>We will send your QR code within <strong>15 minutes</strong>.</p>
    `),
    'order_confirmation'
  );
}

/**
 * Sent when ops (or the supplier integration) attaches the eSIM. This is the
 * email the customer actually needs — the confirmation promises a QR code, and
 * before now nothing ever delivered one.
 */
export async function sendEsimReadyEmail(order: EsimOrder): Promise<boolean> {
  if (!order.customer_email) return false;

  const install = `${appUrl()}/esim/install`;

  return send(
    order.customer_email,
    `Your Domer eSIM for ${order.country} is ready 🎉`,
    shell(`
      <h2 style="margin-top: 0;">Your eSIM is ready to install</h2>
      <p>Order number: <strong style="font-family: monospace;">${esc(order.order_number)}</strong></p>
      ${orderTable(order)}
      ${
        order.qr_code_url
          ? `<p style="text-align: center; margin: 24px 0;">
               <img src="${esc(order.qr_code_url)}" alt="eSIM QR code" width="220" height="220"
                    style="border: 1px solid #E2E8F0; border-radius: 12px;" />
             </p>`
          : ''
      }
      ${
        order.esim_activation_code
          ? `<p style="color: #475569;">Manual activation code:<br />
               <code style="font-size: 13px; word-break: break-all;">${esc(order.esim_activation_code)}</code>
             </p>`
          : ''
      }
      <p style="margin-top: 24px;">
        <a href="${esc(install)}"
           style="background: #C69749; color: #fff; padding: 12px 22px; border-radius: 10px;
                  text-decoration: none; font-weight: 600; display: inline-block;">
          Step-by-step install guide
        </a>
      </p>
      <p style="color: #475569; font-size: 14px;">
        Install over Wi-Fi <strong>before</strong> you fly. Keep this email — the QR code can only be scanned once.
      </p>
    `),
    'esim_ready'
  );
}
