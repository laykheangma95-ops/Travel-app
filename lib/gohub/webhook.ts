// ─────────────────────────────────────────────────────────────────────────────
// Inbound GoHub webhooks: verification, normalization, and de-duplication.
//
// Three things have to be true of every webhook we accept:
//
//   1. It is signed. `X-hmac-signature` is a base64 SHA256 HMAC of the RAW
//      body — verify against the exact bytes received, never a re-serialized
//      object, because key order would differ and the signature would not match.
//   2. It is idempotent. GoHub retries on any non-2xx, and MOCK_WEBHOOK_DUPLICATE
//      exists precisely so we can prove a redelivery does not mint a second
//      eSIM record for the same ICCID.
//   3. An empty `orderDetails` on a Failed fulfilment is a real event, not a
//      no-op. A customer has paid and has nothing.
//
// This module deliberately does NOT write to the database — wiring it into
// delivery is the next task. It gives the route handler a verified, normalized,
// de-duplicated event and nothing more.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readSalesCode } from './normalize';

export const WEBHOOK_SIGNATURE_HEADER = 'x-hmac-signature';

export type WebhookEventType = 'b2b.order_sale' | 'b2b.order_fulfill';

export interface WebhookFulfilledSerial {
  itemCode: string;
  iccid: string;
  qrCodeUrl: string;
  iosLpa: string;
  androidLpa: string;
  activationExpiryDate: string | null;
}

export interface SaleWebhook {
  type: 'b2b.order_sale';
  salesCode: string;
  partnerReference: string;
  /** Lowercased. */
  saleStatus: string;
}

export interface FulfilWebhook {
  type: 'b2b.order_fulfill';
  salesCode: string;
  partnerReference: string;
  /** Lowercased: `completed`, `failed`, `processing`. */
  fulfilmentStatus: string;
  /** Empty unless the fulfilment completed. */
  serials: WebhookFulfilledSerial[];
}

export type GohubWebhook = SaleWebhook | FulfilWebhook;

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/** Constant-time comparison of the base64 HMAC. */
export function verifySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret = process.env.GOHUB_HMAC_SECRET ?? ''
): boolean {
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }

  // timingSafeEqual throws on a length mismatch, which would itself leak.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/** Verifies and normalizes. Throws WebhookVerificationError on a bad signature. */
export function parseWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret?: string
): GohubWebhook {
  if (!verifySignature(rawBody, signature, secret)) {
    throw new WebhookVerificationError('Invalid or missing X-hmac-signature');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new WebhookVerificationError('Webhook body is not valid JSON');
  }

  const eventType = String(payload.eventType ?? '');
  const data = (payload.data ?? {}) as Record<string, unknown>;

  // `saleCode` here, `salesCode` in every REST response. Same value.
  const salesCode = readSalesCode(data as { saleCode?: string; salesCode?: string }) ?? '';
  const partnerReference = String(data.partnerReference ?? '');

  if (eventType === 'b2b.order_sale') {
    return {
      type: 'b2b.order_sale',
      salesCode,
      partnerReference,
      saleStatus: String(data.saleStatus ?? '').toLowerCase(),
    };
  }

  if (eventType === 'b2b.order_fulfill') {
    // Either spelling, same as everywhere else.
    const status = String(data.fulfillmentStatus ?? data.fulfilmentStatus ?? '').toLowerCase();
    const details = Array.isArray(data.orderDetails) ? data.orderDetails : [];

    return {
      type: 'b2b.order_fulfill',
      salesCode,
      partnerReference,
      fulfilmentStatus: status,
      serials: details.map((raw) => {
        const detail = (raw ?? {}) as Record<string, unknown>;
        return {
          itemCode: String(detail.itemCode ?? ''),
          iccid: String(detail.iccid ?? ''),
          qrCodeUrl: String(detail.linkInfoSim ?? ''),
          iosLpa: String(detail.iosLpa ?? ''),
          androidLpa: String(detail.androidLpa ?? ''),
          activationExpiryDate: detail.activationExpiryDate
            ? String(detail.activationExpiryDate)
            : null,
        };
      }),
    };
  }

  throw new WebhookVerificationError(`Unknown webhook eventType: ${eventType || '(missing)'}`);
}

/**
 * Stable key for one logical delivery. A retry and a duplicate both produce the
 * same key; a genuine state change (Processing → Completed) does not.
 */
export function webhookKey(event: GohubWebhook): string {
  return event.type === 'b2b.order_sale'
    ? `sale:${event.salesCode}:${event.saleStatus}`
    : `fulfil:${event.salesCode}:${event.fulfilmentStatus}:${event.serials
        .map((serial) => serial.iccid)
        .sort()
        .join(',')}`;
}

/**
 * In-process de-duplication.
 *
 * Enough to make a redelivery a no-op within one server instance, and enough
 * for the contract tests. It is NOT the production guarantee: that must be a
 * unique constraint on the ICCID in the eSIM table, because two instances will
 * happily process the same webhook concurrently and neither will see the
 * other's memory. Wiring that up is the delivery task, not this one.
 */
const seen = new Map<string, number>();
const SEEN_TTL_MS = 6 * 60 * 60 * 1000;

export function markSeen(key: string, now = Date.now()): boolean {
  for (const [existing, at] of seen) {
    if (now - at > SEEN_TTL_MS) seen.delete(existing);
  }
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

export function resetSeen(): void {
  seen.clear();
}

export interface IngestResult {
  event: GohubWebhook;
  /** False when this exact delivery has already been processed. */
  fresh: boolean;
}

/** Verify, normalize, and tell the caller whether it has seen this before. */
export function ingestWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret?: string
): IngestResult {
  const event = parseWebhook(rawBody, signature, secret);
  return { event, fresh: markSeen(webhookKey(event)) };
}
