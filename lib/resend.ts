import { Resend } from 'resend';
import type { EsimOrder } from '@/types';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function sendOrderConfirmationEmail(order: EsimOrder): Promise<boolean> {
  const resend = getResend();
  if (!resend || !order.customer_email) return false;
  try {
    await resend.emails.send({
      from: 'Domer <orders@domnerapp.com>',
      to: order.customer_email,
      subject: `Your Domer eSIM order ${order.order_number} is confirmed ✈️`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
          <div style="background: #14263F; padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">
              <span style="color: #E6CB8B;">Domer</span> <span style="color: #C69749; font-size: 11px; letter-spacing: 4px;">TRAVEL</span>
            </h1>
          </div>
          <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: 0; border-radius: 0 0 16px 16px;">
            <h2 style="margin-top: 0;">Your eSIM is being prepared!</h2>
            <p>Order number: <strong style="font-family: monospace;">${order.order_number}</strong></p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px 0; color: #475569;">Destination</td><td style="text-align: right;">${order.country}</td></tr>
              <tr><td style="padding: 8px 0; color: #475569;">Plan</td><td style="text-align: right;">${order.plan_name} — ${order.duration_days} days, ${order.data_gb_daily}GB/day</td></tr>
              <tr><td style="padding: 8px 0; color: #475569;">Total</td><td style="text-align: right;"><strong>$${order.price_usd.toFixed(2)}</strong></td></tr>
            </table>
            <p>We will send your QR code within <strong>15 minutes</strong>.</p>
            <p style="color: #475569; font-size: 14px;">24/7 Khmer support — reply to this email or message us on Telegram.</p>
          </div>
        </div>`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The QR delivery mail — sent once ops has generated the eSIM. Separate from
 * the order confirmation above, which only acknowledges payment.
 *
 * The QR is referenced by URL rather than inlined: mail clients that block
 * remote images would otherwise hide the one thing the customer needs, so the
 * manual activation code and a link back to the order are included as text.
 */
export async function sendEsimQrEmail(order: EsimOrder): Promise<boolean> {
  const resend = getResend();
  if (!resend || !order.customer_email || !order.qr_code_url) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://domnerapp.com';
  try {
    await resend.emails.send({
      from: 'Domer <orders@domnerapp.com>',
      to: order.customer_email,
      subject: `Your Domer eSIM QR code — ${order.order_number} 📶`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
          <div style="background: #14263F; padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">
              <span style="color: #E6CB8B;">Domer</span> <span style="color: #C69749; font-size: 11px; letter-spacing: 4px;">TRAVEL</span>
            </h1>
          </div>
          <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: 0; border-radius: 0 0 16px 16px;">
            <h2 style="margin-top: 0;">Your eSIM is ready</h2>
            <p>Order <strong style="font-family: monospace;">${order.order_number}</strong> — ${order.country}, ${order.plan_name}</p>
            <div style="text-align: center; margin: 28px 0;">
              <img src="${order.qr_code_url}" alt="eSIM QR code" width="240" height="240" style="border: 1px solid #E2E8F0; border-radius: 12px;" />
            </div>
            <p style="font-size: 14px; color: #475569;">
              Can't see the QR code? <a href="${appUrl}/my-esims" style="color: #C69749;">View it in your account</a>.
            </p>
            <h3 style="font-size: 15px;">How to install</h3>
            <ol style="color: #475569; font-size: 14px; padding-left: 18px;">
              <li>Settings → Mobile Service → Add eSIM</li>
              <li>Scan this QR from another screen, or save the image and pick it</li>
              <li>Label it "Domer" and keep your home SIM as primary</li>
              <li>Turn data roaming ON for the Domer line once you land</li>
            </ol>
            <p style="background: #FEF3C7; padding: 12px; border-radius: 8px; font-size: 14px;">
              <strong>Install before you fly.</strong> Adding an eSIM needs wi-fi or data.
            </p>
            <p style="color: #475569; font-size: 14px;">24/7 Khmer support — just reply to this email.</p>
          </div>
        </div>`,
    });
    return true;
  } catch {
    return false;
  }
}
