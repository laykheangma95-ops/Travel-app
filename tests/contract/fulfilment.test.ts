// ─────────────────────────────────────────────────────────────────────────────
// Fulfilment happens asynchronously, over a webhook, minutes after we confirm.
// Everything a customer actually receives depends on that callback arriving,
// being genuine, and being processed exactly once.
//
// These tests need to redirect the supplier's webhooks at a local receiver, so
// they run against the mock only and skip against staging — where webhooks go
// to the deployed endpoint and are asserted there instead.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ingestWebhook,
  parseWebhook,
  resetSeen,
  verifySignature,
  type FulfilWebhook,
} from '@/lib/gohub/webhook';
import {
  HMAC_SECRET,
  client,
  devApi,
  eventually,
  isMock,
  orderInput,
  pickOrderableItem,
  reference,
  startWebhookReceiver,
  type WebhookReceiver,
} from './helpers';

const FAIL_ITEM_CODE = 'EKHM3DPY01GB03D_FAIL';

let receiver: WebhookReceiver | null = null;
let mock = false;
let item: Awaited<ReturnType<typeof pickOrderableItem>>;

beforeAll(async () => {
  mock = await isMock();
  if (!mock) return;

  item = await pickOrderableItem();
  receiver = await startWebhookReceiver();
  await devApi.setWebhookUrl(receiver.url);
  // Two stages at 300ms each rather than 5s each — same code path, less waiting.
  await devApi.setConfig({ fulfilDelayMs: 300 });
});

afterAll(async () => {
  if (!mock) return;
  await devApi.setConfig({ fulfilDelayMs: 5_000 });
  await devApi.setWebhookUrl(null);
  await receiver?.close();
});

describe('fulfilment webhooks', () => {
  it('delivers a signed fulfilment webhook with a complete serial', async ({ skip }) => {
    if (!mock || !receiver) return skip();

    const created = await client.createOrder(orderInput(reference('DOMNER-FULFIL'), item, {
      quantity: 2,
    }));
    await client.confirmOrder(created.salesCode);

    const captured = await receiver.waitFor(
      (hook) =>
        hook.rawBody.includes(created.salesCode) && hook.rawBody.includes('b2b.order_fulfill')
    );

    // The signature must verify against the RAW bytes. Re-serializing the
    // parsed object would reorder keys and produce a different HMAC — a bug
    // that only shows up against a real supplier if we do not test for it here.
    expect(verifySignature(captured.rawBody, captured.signature, HMAC_SECRET)).toBe(true);
    expect(verifySignature(captured.rawBody, captured.signature, 'wrong-secret')).toBe(false);
    expect(verifySignature(`${captured.rawBody} `, captured.signature, HMAC_SECRET)).toBe(false);

    const event = parseWebhook(captured.rawBody, captured.signature, HMAC_SECRET) as FulfilWebhook;

    expect(event.type).toBe('b2b.order_fulfill');
    // The webhook says `saleCode`; every REST response says `salesCode`.
    expect(event.salesCode).toBe(created.salesCode);
    expect(event.partnerReference).toBe(created.partnerOrderReference);
    expect(event.fulfilmentStatus).toBe('completed');

    // One serial per unit, and every field the customer needs to install.
    expect(event.serials).toHaveLength(2);
    for (const serial of event.serials) {
      expect(serial.iccid).toMatch(/^\d{16,}/);
      expect(serial.qrCodeUrl).toMatch(/^https?:\/\//);
      expect(serial.androidLpa).toMatch(/^LPA:1\$.+\$.+/);
      expect(serial.iosLpa).toContain('SM-DP');
      expect(serial.activationExpiryDate).toBeTruthy();
    }

    // And the same serials must be readable from the order itself.
    const order = await eventually(
      () => client.getOrderBySalesCode(created.salesCode),
      (value) => value?.fulfilmentStatus === 'completed'
    );

    expect(order!.serials).toHaveLength(2);
    expect(order!.serials.map((serial) => serial.iccid).sort()).toEqual(
      event.serials.map((serial) => serial.iccid).sort()
    );
    for (const serial of order!.serials) {
      expect(serial.smdpAddress).toBeTruthy();
      expect(serial.activationCode).toBeTruthy();
      expect(serial.qrCodeUrl).toMatch(/^https?:\/\//);
    }

    // The QR link must be a real image. A 404 here means an empty box in the
    // delivery email and a customer with nothing to scan.
    const image = await fetch(order!.serials[0]!.qrCodeUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/png');
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('sends an empty orderDetails array when fulfilment fails', async ({ skip }) => {
    if (!mock || !receiver) return skip();

    const failItem = { code: FAIL_ITEM_CODE, name: 'Fulfilment failure', days: 3, priceVnd: 177415 };
    const created = await client.createOrder(orderInput(reference('DOMNER-FAIL'), failItem));
    await client.confirmOrder(created.salesCode);

    const captured = await receiver.waitFor(
      (hook) =>
        hook.rawBody.includes(created.salesCode) && hook.rawBody.includes('b2b.order_fulfill')
    );

    const event = parseWebhook(captured.rawBody, captured.signature, HMAC_SECRET) as FulfilWebhook;

    expect(event.fulfilmentStatus).toBe('failed');
    expect(event.serials).toEqual([]);

    // A paid order with no eSIM is the case that must never be mistaken for a
    // quiet success. The status carries the meaning, not the empty array.
    const order = await eventually(
      () => client.getOrderBySalesCode(created.salesCode),
      (value) => value?.fulfilmentStatus === 'failed'
    );
    expect(order!.serials).toEqual([]);
    expect(order!.salesStatus).toBe('confirmed');
  });

  it('processes a duplicate delivery exactly once', async ({ skip }) => {
    if (!mock || !receiver) return skip();

    const created = await client.createOrder(orderInput(reference('DOMNER-DUPHOOK'), item));
    await client.confirmOrder(created.salesCode);

    const captured = await receiver.waitFor(
      (hook) =>
        hook.rawBody.includes(created.salesCode) && hook.rawBody.includes('b2b.order_fulfill')
    );

    resetSeen();

    // Stands in for the eSIM table. GoHub retries on any non-2xx and can
    // redeliver spontaneously, so a second identical delivery must not mint a
    // second eSIM for the same ICCID.
    const esimRecords = new Map<string, { iccid: string; salesCode: string }>();

    const handle = (rawBody: string, signature: string | null): boolean => {
      const { event, fresh } = ingestWebhook(rawBody, signature, HMAC_SECRET);
      if (!fresh || event.type !== 'b2b.order_fulfill') return false;
      for (const serial of event.serials) {
        esimRecords.set(serial.iccid, { iccid: serial.iccid, salesCode: event.salesCode });
      }
      return true;
    };

    expect(handle(captured.rawBody, captured.signature)).toBe(true);
    const afterFirst = esimRecords.size;
    expect(afterFirst).toBeGreaterThan(0);

    // Byte-identical redelivery, twice more.
    expect(handle(captured.rawBody, captured.signature)).toBe(false);
    expect(handle(captured.rawBody, captured.signature)).toBe(false);
    expect(esimRecords.size).toBe(afterFirst);
  });

  it('rejects a webhook whose signature does not match', async ({ skip }) => {
    if (!mock || !receiver) return skip();

    const captured = receiver.captured[0];
    if (!captured) return skip();

    expect(() => parseWebhook(captured.rawBody, 'not-a-signature', HMAC_SECRET)).toThrow();
    expect(() => parseWebhook(captured.rawBody, null, HMAC_SECRET)).toThrow();
  });
});
