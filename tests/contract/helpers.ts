// ─────────────────────────────────────────────────────────────────────────────
// Shared setup for the contract suite.
//
// Every test in tests/contract runs unchanged against the mock and against real
// staging. The only difference is what GOHUB_BASE_URL points at.
//
// Tests that need supplier-side setup — dropping the balance to force an
// insufficient-balance failure, redirecting webhooks at a local receiver — go
// through the mock's /dev routes and skip themselves when those are absent.
// That is what `mockOnly` is for.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { GohubClient } from '@/lib/gohub/client';

// Defaults line up with mock-gohub's own defaults, so `npm run mock` +
// `npm run test:contract` works with an empty .env.
process.env.GOHUB_BASE_URL ||= 'http://localhost:4000/api';
process.env.GOHUB_PARTNER_ID ||= 'domner-mock-partner';
process.env.GOHUB_API_KEY ||= 'domner-mock-key';
process.env.GOHUB_HMAC_SECRET ||= 'domner-mock-hmac-secret';
process.env.GOHUB_TIMEOUT_MS ||= '15000';

export const BASE_URL = process.env.GOHUB_BASE_URL;
export const PARTNER_ID = process.env.GOHUB_PARTNER_ID;
export const API_KEY = process.env.GOHUB_API_KEY;
export const HMAC_SECRET = process.env.GOHUB_HMAC_SECRET;

/** Origin of the API, for the non-/api dev routes. */
export const ORIGIN = new URL(BASE_URL).origin;

export const client = new GohubClient();

export const authHeaders = {
  'Content-Type': 'application/json',
  'X-Partner': PARTNER_ID,
  'X-Authorization': API_KEY,
};

/** Unique per run, so re-running the suite never collides on a duplicate reference. */
export function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DevCapabilities {
  mock: true;
  fulfilDelayMs: number;
  slowFulfilDelayMs: number;
  webhookDuplicate: boolean;
  webhookUrl: string;
}

let capabilities: DevCapabilities | null | undefined;

/** Null against a real API, which has no /dev routes. */
export async function devCapabilities(): Promise<DevCapabilities | null> {
  if (capabilities !== undefined) return capabilities;
  try {
    const response = await fetch(`${ORIGIN}/dev/capabilities`, {
      signal: AbortSignal.timeout(5_000),
    });
    capabilities = response.ok ? ((await response.json()) as DevCapabilities) : null;
  } catch {
    capabilities = null;
  }
  return capabilities;
}

export async function isMock(): Promise<boolean> {
  return (await devCapabilities()) !== null;
}

async function dev(path: string, body: unknown): Promise<Response> {
  return fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

export const devApi = {
  setBalance: (balance: number) => dev('/dev/balance', { balance }),
  setWebhookUrl: (url: string | null) => dev('/dev/webhook-url', { url }),
  setConfig: (patch: Record<string, number>) => dev('/dev/config', patch),
  reset: (balance?: number) => dev('/dev/reset', { balance }),
};

/** A raw call, for the tests that assert on the envelope rather than the client. */
export async function raw(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...authHeaders, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { _unparseable: text };
  }
  return { status: response.status, json };
}

// ── Webhook receiver ─────────────────────────────────────────────────────────

export interface CapturedWebhook {
  rawBody: string;
  signature: string | null;
  receivedAt: number;
}

export interface WebhookReceiver {
  url: string;
  captured: CapturedWebhook[];
  /** Resolves with the first capture matching `predicate`, or rejects on timeout. */
  waitFor(predicate: (hook: CapturedWebhook) => boolean, timeoutMs?: number): Promise<CapturedWebhook>;
  /** Makes the receiver answer 500, so the mock's retry path can be exercised. */
  setStatus(status: number): void;
  close(): Promise<void>;
}

/**
 * Captures the RAW body. Verifying the HMAC against a re-serialized object
 * would pass even if our production handler had the bug of re-serializing —
 * so the bytes are kept exactly as they arrived.
 */
export async function startWebhookReceiver(): Promise<WebhookReceiver> {
  const captured: CapturedWebhook[] = [];
  let status = 200;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      captured.push({
        rawBody: Buffer.concat(chunks).toString('utf8'),
        signature: (req.headers['x-hmac-signature'] as string | undefined) ?? null,
        receivedAt: Date.now(),
      });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/webhooks/gohub`,
    captured,
    setStatus: (next: number) => {
      status = next;
    },
    async waitFor(predicate, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const hit = captured.find(predicate);
        if (hit) return hit;
        if (Date.now() > deadline) {
          throw new Error(
            `Timed out after ${timeoutMs}ms waiting for a webhook. Captured ${captured.length}: ` +
              captured.map((c) => c.rawBody.slice(0, 120)).join(' | ')
          );
        }
        await sleep(100);
      }
    },
    close() {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until `check` passes, for state that settles asynchronously. */
export async function eventually<T>(
  produce: () => Promise<T>,
  check: (value: T) => boolean,
  { timeoutMs = 30_000, intervalMs = 250 } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await produce();

  while (!check(last)) {
    if (Date.now() > deadline) {
      throw new Error(`Condition never became true. Last value: ${JSON.stringify(last)}`);
    }
    await sleep(intervalMs);
    last = await produce();
  }
  return last;
}

/** A cheap, always-present item to order in tests that do not care which one. */
export const TEST_ITEM_CODE = 'EKHM3DPY01GB03D';

export async function pickOrderableItem(): Promise<{
  code: string;
  name: string;
  days: number;
  priceVnd: number;
}> {
  const items = await client.getItems({ simType: 'eSIM', perPage: 100 });
  const item =
    items.rows.find((row) => row.code === TEST_ITEM_CODE && row.active) ??
    items.rows.find((row) => row.active && !/_FAIL$|_SLOW$|_HANG$/.test(row.code));

  if (!item) throw new Error('No orderable item found in the catalog');
  return { code: item.code, name: item.name, days: item.days, priceVnd: item.priceVnd };
}

/** The standard order payload, with the fields GoHub actually validates. */
export function orderInput(
  partnerOrderReference: string,
  item: { code: string; name: string; days: number; priceVnd: number },
  overrides: { quantity?: number } = {}
) {
  return {
    partnerOrderReference,
    language: 'km',
    shippingFirstname: 'Sokha',
    shippingLastname: 'Chan',
    shippingEmail: 'sokha@example.com',
    shippingPhone: '+855 12 345 678',
    orderDetails: [
      {
        itemCode: item.code,
        itemName: item.name,
        days: String(item.days).padStart(2, '0'),
        data: '01GB',
        price: item.priceVnd,
        quantity: overrides.quantity ?? 1,
        partnerUnitPrice: item.priceVnd,
        partnerUnitDiscount: 0,
      },
    ],
  };
}
