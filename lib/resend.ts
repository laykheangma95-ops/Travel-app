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
      from: 'Domner App <orders@domnerapp.com>',
      to: order.customer_email,
      subject: `Your Domner eSIM order ${order.order_number} is confirmed ✈️`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
          <div style="background: #0A1628; padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">
              <span style="color: #93B4E8;">Domner</span><span style="color: #F97316;">App</span>
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
