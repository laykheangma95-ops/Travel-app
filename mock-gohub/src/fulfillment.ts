// ─────────────────────────────────────────────────────────────────────────────
// Async fulfilment simulation.
//
// Confirming an order does not hand you an eSIM. GoHub goes away, talks to a
// telco, and calls back. Everything downstream of us — the delivery email, the
// QR PDF, the "your eSIM is ready" push — has to survive that gap, so the mock
// reproduces it rather than returning serials inline.
//
// FAILURE INJECTION, by item code suffix, so tests are deterministic:
//   _FAIL → fulfilment fails, webhook carries an empty orderDetails array
//   _SLOW → 60 second delay (MOCK_SLOW_FULFILL_DELAY_MS)
//   _HANG → no webhook ever fires; the order sits in Processing forever
// ─────────────────────────────────────────────────────────────────────────────

import { config } from './config';
import { activationCode, iccid as newIccid, nowIso } from './ids';
import { expiryFor, state } from './state';
import type { StoredOrder, WireSerial } from './types';
import { fireWebhook } from './webhooks';

const SMDP_ADDRESS = 'ECPRSP.EASTCOMPEACE.COM';

type Injection = 'none' | 'fail' | 'slow' | 'hang';

function injectionFor(order: StoredOrder): Injection {
  const codes = order.orderDetails.map((detail) => detail.itemCode);
  if (codes.some((code) => code.endsWith('_FAIL'))) return 'fail';
  if (codes.some((code) => code.endsWith('_HANG'))) return 'hang';
  if (codes.some((code) => code.endsWith('_SLOW'))) return 'slow';
  return 'none';
}

/** Writes the fulfilment status under whichever spelling this order uses. */
export function setFulfilmentStatus(order: StoredOrder, status: string): void {
  delete order.fulfillmentStatus;
  delete order.fulfilmentStatus;
  order[order._internal.fulfilmentKeySpelling] = status;
}

export function readFulfilmentStatus(order: StoredOrder): string {
  return order.fulfillmentStatus ?? order.fulfilmentStatus ?? 'None';
}

/** Called on confirmation. Returns immediately; everything happens on timers. */
export function startFulfilment(order: StoredOrder): void {
  const injection = injectionFor(order);
  const delay = injection === 'slow' ? config.slowFulfilDelayMs : config.fulfilDelayMs;

  if (injection === 'hang') {
    // Deliberately silent. The order is now our reconciliation problem, which
    // is the whole point of this case.
    setFulfilmentStatus(order, 'Processing');
    state.save();
    console.log(`[mock-gohub] ${order.salesCode} HANGING — no webhook will fire`);
    return;
  }

  order._internal.fulfilmentTimer = setTimeout(() => {
    setFulfilmentStatus(order, 'Processing');
    // In-flight statuses vary in case on the real API. Half our orders shout.
    order.salesStatus = order._internal.lowercaseStatus ? 'processing' : 'Processing';
    state.save();

    fireWebhook({
      eventType: 'b2b.order_sale',
      data: {
        saleCode: order.salesCode,
        saleStatus: 'Completed',
        partnerReference: order.partnerOrderReference,
      },
    });

    order._internal.fulfilmentTimer = setTimeout(() => {
      if (injection === 'fail') {
        completeAsFailed(order);
      } else {
        completeWithSerials(order);
      }
    }, delay);
  }, delay);
}

function completeAsFailed(order: StoredOrder): void {
  setFulfilmentStatus(order, 'Failed');
  order.salesStatus = 'Confirmed';
  order._internal.fulfilmentTimer = null;
  state.save();

  fireWebhook({
    eventType: 'b2b.order_fulfill',
    data: {
      saleCode: order.salesCode,
      fulfillmentStatus: 'Failed',
      partnerReference: order.partnerOrderReference,
      // Empty unless Completed. A customer paid and got nothing — the handler
      // has to notice that and raise it, not shrug at a well-formed 200.
      orderDetails: [],
    },
  });
}

function completeWithSerials(order: StoredOrder): void {
  const validityDays = order._internal.activationValidityDays;
  const expiry = expiryFor(order.orderDate, validityDays);

  for (const detail of order.orderDetails) {
    const serials: WireSerial[] = [];

    // One serial per unit. Two of the same package is two eSIMs, not one.
    for (let unit = 0; unit < detail.quantity; unit += 1) {
      const iccid = newIccid();
      const code = activationCode();
      const link = `${config.publicUrl}/mock-qr/${iccid}.png`;

      serials.push({
        smdpAddress: SMDP_ADDRESS,
        activationCode: code,
        lpa: 'LPA:1',
        iccid,
        link,
        linkInfoSim: link,
        iosLpa: `SM-DP + Address: ${SMDP_ADDRESS} and Code: ${code}`,
        androidLpa: `LPA:1$${SMDP_ADDRESS}$${code}`,
        activationExpiryDate: expiry,
      });

      state.registerIccid({
        iccid,
        salesCode: order.salesCode,
        itemCode: detail.itemCode,
        itemName: detail.itemName,
        activationValidityDays: validityDays,
        orderedAt: order.orderDate,
        activatedAt: null,
        activationExpiryDate: expiry,
        dataAmountValue: '',
        dataAmountUnit: 'GB',
        days: detail.days,
      });
    }

    detail.serials = serials;
    detail.links = serials.map((serial) => serial.link).join(',');
  }

  setFulfilmentStatus(order, 'Completed');
  order.salesStatus = 'Confirmed';
  order._internal.fulfilmentTimer = null;
  state.save();

  fireWebhook({
    eventType: 'b2b.order_fulfill',
    data: {
      saleCode: order.salesCode,
      fulfillmentStatus: 'Completed',
      partnerReference: order.partnerOrderReference,
      orderDetails: order.orderDetails.flatMap((detail) =>
        (detail.serials ?? []).map((serial) => ({
          itemCode: detail.itemCode,
          iccid: serial.iccid,
          linkInfoSim: serial.linkInfoSim,
          iosLpa: serial.iosLpa,
          androidLpa: serial.androidLpa,
          activationExpiryDate: serial.activationExpiryDate,
        }))
      ),
    },
  });
}
