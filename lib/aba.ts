import crypto from 'crypto';

// ABA PayWay integration (Purchase API v1).
//
// Sandbox: https://checkout-sandbox.payway.com.kh
// Live:    https://checkout.payway.com.kh
//
// Set ABA_CHECKOUT_URL to the sandbox host while testing, then switch to live.
// The gateway expects a POST of form fields (NOT a GET redirect) — see
// app/esim/checkout/page.tsx, which auto-submits the `fields` returned here.

const ABA_CHECKOUT_URL =
  process.env.ABA_CHECKOUT_URL ?? 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase';

// Leave empty to let ABA show every method the merchant account supports
// (cards + KHQR + ABA Pay). Set e.g. 'abapay_khqr' to force a single method.
const ABA_PAYMENT_OPTION = process.env.ABA_PAYMENT_OPTION ?? '';

// ---------------------------------------------------------------------------
// Hash field order.
//
// PayWay signs a plain concatenation of these field VALUES, in exactly this
// order, with HMAC-SHA512 keyed by the API key, base64-encoded. Fields that are
// not sent contribute an empty string but must keep their slot.
//
// !! VERIFY THIS LIST against the integration PDF ABA sends with your merchant
// credentials. The order differs between PayWay API versions, and a mismatch
// produces an "invalid hash" rejection at checkout. This array is the only
// thing that needs editing if their spec differs.
// ---------------------------------------------------------------------------
const HASH_FIELD_ORDER = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'items',
  'shipping',
  'firstname',
  'lastname',
  'email',
  'phone',
  'type',
  'payment_option',
  'return_url',
  'cancel_url',
  'continue_success_url',
  'return_deeplink',
  'currency',
  'custom_fields',
  'return_params',
] as const;

// Fields PayWay includes in the pushback (server-to-server callback) signature,
// in order. Also worth confirming against the same PDF.
const PUSHBACK_HASH_FIELD_ORDER = ['tran_id', 'apv', 'status'] as const;

export interface AbaLineItem {
  name: string;
  quantity: number;
  priceUsd: number;
}

export interface AbaPaymentInput {
  amountUsd: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: AbaLineItem[];
  /** Server-to-server callback (our webhook). PayWay calls this to confirm payment. */
  pushbackUrl: string;
  /** Where the shopper's browser lands after a successful payment. */
  successUrl: string;
  /** Where the shopper's browser lands if they abandon the payment. */
  cancelUrl: string;
}

export function isAbaConfigured(): boolean {
  return Boolean(process.env.ABA_MERCHANT_ID && process.env.ABA_API_KEY);
}

function hmacSha512Base64(payload: string, key: string): string {
  return crypto.createHmac('sha512', key).update(payload).digest('base64');
}

function splitName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return { firstname: fullName.trim(), lastname: '' };
  return { firstname: parts.slice(0, -1).join(' '), lastname: parts[parts.length - 1] };
}

function encodeItems(items: AbaLineItem[]): string {
  const payload = items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    price: i.priceUsd.toFixed(2),
  }));
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export type AbaPaymentResult =
  | { demo: true; paymentUrl: string }
  | { demo: false; paymentUrl: string; fields: Record<string, string> };

// Builds the signed field set ABA PayWay expects. The caller returns `fields` to
// the browser, which POSTs them to `paymentUrl` as a form submission.
export function createAbaPayment(input: AbaPaymentInput): AbaPaymentResult {
  if (!isAbaConfigured()) {
    return {
      demo: true,
      paymentUrl: `/order-confirmation/${input.orderNumber}?method=aba&demo=1`,
    };
  }

  const merchantId = process.env.ABA_MERCHANT_ID!;
  const apiKey = process.env.ABA_API_KEY!;
  const { firstname, lastname } = splitName(input.customerName);

  // Every field that participates in the hash must be built here first, so the
  // signature is always computed over exactly what we transmit.
  const fields: Record<string, string> = {
    req_time: new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14),
    merchant_id: merchantId,
    tran_id: input.orderNumber,
    amount: input.amountUsd.toFixed(2),
    items: encodeItems(input.items),
    shipping: '',
    firstname,
    lastname,
    email: input.customerEmail,
    phone: input.customerPhone,
    type: 'purchase',
    payment_option: ABA_PAYMENT_OPTION,
    // PayWay requires the pushback URL base64-encoded; the browser-facing URLs
    // are sent as plain strings.
    return_url: Buffer.from(input.pushbackUrl).toString('base64'),
    cancel_url: input.cancelUrl,
    continue_success_url: input.successUrl,
    return_deeplink: '',
    currency: 'USD',
    custom_fields: '',
    return_params: input.orderNumber,
  };

  const hashInput = HASH_FIELD_ORDER.map((key) => fields[key] ?? '').join('');
  fields.hash = hmacSha512Base64(hashInput, apiKey);

  return { demo: false, paymentUrl: ABA_CHECKOUT_URL, fields };
}

/**
 * Verifies a PayWay pushback signature. PayWay signs with the same API key
 * unless a distinct webhook secret was issued, so ABA_API_KEY is the fallback.
 */
export function verifyAbaWebhook(body: Record<string, string>): boolean {
  const secret = process.env.ABA_WEBHOOK_SECRET || process.env.ABA_API_KEY;
  if (!secret) return false;

  const received = body.hash;
  if (typeof received !== 'string' || received.length === 0) return false;

  const payload = PUSHBACK_HASH_FIELD_ORDER.map((key) => body[key] ?? '').join('');
  const expected = hmacSha512Base64(payload, secret);

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual throws when lengths differ, so compare lengths first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** PayWay reports success as status "00"; anything else is a failure. */
export function isAbaPaymentApproved(status: string | undefined): boolean {
  return status === '00' || status === 'APPROVED';
}
