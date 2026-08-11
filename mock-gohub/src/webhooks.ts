// ─────────────────────────────────────────────────────────────────────────────
// Outbound webhooks.
//
// Signed with a base64 SHA256 HMAC of the RAW body — so the receiver must
// verify against the exact bytes it was sent, not a re-serialization of the
// parsed object. Key ordering differences would break the signature otherwise,
// and that is a real failure mode worth rehearsing against the mock.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac } from 'node:crypto';
import { config } from './config';
import { state } from './state';

export interface SaleEvent {
  eventType: 'b2b.order_sale';
  data: {
    /** `saleCode` here, `salesCode` everywhere else. GoHub's inconsistency, reproduced. */
    saleCode: string;
    saleStatus: string;
    partnerReference: string;
  };
}

export interface FulfilEvent {
  eventType: 'b2b.order_fulfill';
  data: {
    saleCode: string;
    fulfillmentStatus: string;
    partnerReference: string;
    orderDetails: Array<{
      itemCode: string;
      iccid: string;
      linkInfoSim: string;
      iosLpa: string;
      androidLpa: string;
      activationExpiryDate: string;
    }>;
  };
}

export type WebhookEvent = SaleEvent | FulfilEvent;

export function sign(rawBody: string): string {
  return createHmac('sha256', config.hmacSecret).update(rawBody).digest('base64');
}

function targetUrl(): string {
  return state.webhookUrl ?? config.webhookUrl;
}

/**
 * Fire and forget, with retries. Never awaited by a request handler — the real
 * API does not hold an order open while its webhook is in flight, and neither
 * should we.
 */
export function fireWebhook(event: WebhookEvent): void {
  void deliver(event).catch((error) => {
    console.warn('[mock-gohub] webhook gave up:', error);
  });

  if (config.webhookDuplicate) {
    // Byte-identical redelivery — the receiver must dedupe, not us.
    void deliver(event).catch(() => undefined);
  }
}

async function deliver(event: WebhookEvent): Promise<void> {
  const rawBody = JSON.stringify(event);
  const url = targetUrl();
  const attempts = config.webhookRetries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-hmac-signature': sign(rawBody),
        },
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        console.log(`[mock-gohub] webhook ${event.eventType} → ${response.status}`);
        return;
      }
      console.warn(
        `[mock-gohub] webhook ${event.eventType} attempt ${attempt} → ${response.status}`
      );
    } catch (error) {
      console.warn(`[mock-gohub] webhook ${event.eventType} attempt ${attempt} failed:`, error);
    }

    if (attempt < attempts) {
      // 1s, 2s, 4s.
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw new Error(`webhook ${event.eventType} failed after ${attempts} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
