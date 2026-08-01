import crypto from 'crypto';
import { assertConfigured } from './env';
import { log } from './logger';

// ABA PayWay integration.
// Sandbox: https://checkout.payway.com.kh — replace with live credentials for production.

const ABA_CHECKOUT_URL =
  process.env.ABA_CHECKOUT_URL ?? 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase';

export interface AbaPaymentInput {
  /** Authoritative total from lib/pricing.ts, in USD. */
  amountUsd: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}

export function isAbaConfigured(): boolean {
  return Boolean(process.env.ABA_MERCHANT_ID && process.env.ABA_API_KEY);
}

function abaHash(payload: string): string {
  return crypto
    .createHmac('sha512', process.env.ABA_API_KEY ?? '')
    .update(payload)
    .digest('base64');
}

export type AbaPaymentResult =
  | { demo: true; paymentUrl: string }
  | { demo: false; paymentUrl: string; fields: Record<string, string> };

/**
 * Builds the signed payload ABA PayWay expects; the client posts it to the
 * checkout URL.
 *
 * As with Stripe, the demo branch is a development convenience only —
 * `assertConfigured` throws in production rather than returning a fake payment
 * that the caller might record as settled.
 */
export function createAbaPayment(input: AbaPaymentInput): AbaPaymentResult {
  const live = assertConfigured('aba');

  if (!live) {
    log.warn('aba.demo_payment', { orderNumber: input.orderNumber });
    return {
      demo: true,
      paymentUrl: `/order-confirmation/${input.orderNumber}?method=aba&demo=1`,
    };
  }

  const merchantId = process.env.ABA_MERCHANT_ID!;
  const reqTime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const amount = input.amountUsd.toFixed(2);
  const hashInput = `${reqTime}${merchantId}${input.orderNumber}${amount}`;

  return {
    demo: false,
    paymentUrl: ABA_CHECKOUT_URL,
    fields: {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: input.orderNumber,
      amount,
      firstname: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      return_url: Buffer.from(input.returnUrl).toString('base64'),
      currency: 'USD',
      payment_option: 'abapay_khqr',
      hash: abaHash(hashInput),
    },
  };
}

/**
 * Verifies an ABA PayWay callback signature.
 *
 * Returns false on every failure path. The previous version called
 * `crypto.timingSafeEqual` on two buffers that may differ in length, which
 * THROWS a RangeError rather than returning false — so a malformed callback
 * produced an unhandled 500 instead of a clean rejection. Lengths are compared
 * first now, and the constant-time comparison only runs on equal-length input.
 */
export function verifyAbaWebhook(body: Record<string, unknown>): boolean {
  // Throws in production if the secret is missing — we must never accept an
  // unverifiable payment callback.
  assertConfigured('abaWebhook');

  const secret = process.env.ABA_WEBHOOK_SECRET;
  if (!secret) return false;

  const { hash, ...rest } = body;
  if (typeof hash !== 'string' || hash.length === 0) return false;

  const payload = Object.keys(rest)
    .sort()
    .map((key) => String(rest[key] ?? ''))
    .join('');

  const expected = crypto.createHmac('sha512', secret).update(payload).digest('base64');

  const provided = Buffer.from(hash, 'utf8');
  const computed = Buffer.from(expected, 'utf8');

  // timingSafeEqual requires equal lengths; an unequal length is already a
  // mismatch, and revealing that fact tells an attacker nothing useful.
  if (provided.length !== computed.length) {
    log.warn('aba.webhook_signature_length_mismatch');
    return false;
  }

  const valid = crypto.timingSafeEqual(provided, computed);
  if (!valid) log.warn('aba.webhook_signature_invalid');
  return valid;
}

/** ABA reports success as status '00' (or the textual form on some accounts). */
export function isAbaPaid(status: unknown): boolean {
  return status === '00' || status === 0 || status === 'APPROVED';
}
