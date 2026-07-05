import crypto from 'crypto';

// ABA PayWay integration.
// Sandbox: https://checkout.payway.com.kh — replace with live credentials for production.

const ABA_CHECKOUT_URL =
  process.env.ABA_CHECKOUT_URL ?? 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase';

export interface AbaPaymentInput {
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

// Builds the signed payload ABA PayWay expects; the client posts it to the
// checkout URL (or we return a demo URL when unconfigured).
export function createAbaPayment(input: AbaPaymentInput) {
  if (!isAbaConfigured()) {
    return {
      demo: true as const,
      paymentUrl: `/order-confirmation/${input.orderNumber}?method=aba&demo=1`,
    };
  }
  const merchantId = process.env.ABA_MERCHANT_ID!;
  const reqTime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const amount = input.amountUsd.toFixed(2);
  const hashInput = `${reqTime}${merchantId}${input.orderNumber}${amount}`;
  return {
    demo: false as const,
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

export function verifyAbaWebhook(body: Record<string, string>): boolean {
  const secret = process.env.ABA_WEBHOOK_SECRET;
  if (!secret) return false;
  const { hash, ...rest } = body;
  const payload = Object.keys(rest)
    .sort()
    .map((k) => rest[k])
    .join('');
  const expected = crypto.createHmac('sha512', secret).update(payload).digest('base64');
  return Boolean(hash) && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}
