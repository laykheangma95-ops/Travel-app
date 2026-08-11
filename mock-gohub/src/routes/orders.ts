import { Router } from 'express';
import { config } from '../config';
import { fail, ok, paginated } from '../envelope';
import { readFulfilmentStatus, setFulfilmentStatus, startFulfilment } from '../fulfillment';
import { nowIso, salesCode as newSalesCode } from '../ids';
import { activationValidityDaysFor, findItem, state } from '../state';
import type { StoredOrder, WireOrder, WireOrderDetail } from '../types';

export const ordersRouter: Router = Router();

const ALREADY_HANDLED =
  'The request has already been handled, sending the same payload again is not allowed.';

const TOP_LEVEL_FIELDS = new Set([
  'partnerOrderReference',
  'discountCode',
  'requestDate',
  'shippingFirstname',
  'shippingLastname',
  'shippingPhone',
  'shippingEmail',
  'shippingAddress',
  'invoiceName',
  'invoiceEmail',
  'invoiceTaxCode',
  'invoiceAddress',
  'language',
  'partnerOrderDiscount',
  'orderDetails',
]);

const DETAIL_FIELDS = new Set([
  'itemCode',
  'itemName',
  'days',
  'data',
  'price',
  'quantity',
  'partnerUnitPrice',
  'partnerUnitDiscount',
]);

// Deliberately permissive: this is a supplier's validator, not ours. It rejects
// obvious rubbish and nothing more.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9\s\-().]{5,19}$/;

// ── POST /api/orders ─────────────────────────────────────────────────────────

ordersRouter.post('/orders', (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(res, 400, 'Wrong argument');
  }
  for (const key of Object.keys(body)) {
    if (!TOP_LEVEL_FIELDS.has(key)) return fail(res, 400, 'Wrong argument');
  }

  const reference = String(body.partnerOrderReference ?? '').trim();
  if (!reference) return fail(res, 400, 'Wrong argument');

  // Checked before anything else is validated: a replay must not be able to
  // learn anything about the payload it replayed.
  if (state.ordersByReference.has(reference)) {
    return fail(res, 430, ALREADY_HANDLED);
  }

  const shippingEmail = optionalString(body.shippingEmail);
  if (shippingEmail !== null && !EMAIL.test(shippingEmail)) {
    return fail(res, 400, 'Invalid email');
  }

  const shippingPhone = optionalString(body.shippingPhone);
  if (shippingPhone !== null && !PHONE.test(shippingPhone)) {
    return fail(res, 400, 'Invalid phone');
  }

  const rawDetails = body.orderDetails;
  if (!Array.isArray(rawDetails) || rawDetails.length === 0) {
    return fail(res, 400, 'Wrong argument');
  }

  const details: WireOrderDetail[] = [];
  let total = 0;
  let partnerSubtotal = 0;

  for (const raw of rawDetails) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fail(res, 400, 'Wrong argument');
    }
    const detail = raw as Record<string, unknown>;
    for (const key of Object.keys(detail)) {
      if (!DETAIL_FIELDS.has(key)) return fail(res, 400, 'Wrong argument');
    }

    const itemCode = String(detail.itemCode ?? '');
    const item = findItem(itemCode);
    if (!item) return fail(res, 404, `Resource not found, item ID: ${itemCode}`);

    const quantity = detail.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      return fail(res, 400, 'Invalid quantity');
    }

    // The catalog price is authoritative. A partner that sends a stale price
    // does not get to buy at it.
    const unitPrice = Number.parseInt(item.price, 10);
    const partnerUnitPrice = numberOr(detail.partnerUnitPrice, unitPrice);
    const partnerUnitDiscount = numberOr(detail.partnerUnitDiscount, 0);
    const lineAmount = (partnerUnitPrice - partnerUnitDiscount) * quantity;

    total += unitPrice * quantity;
    partnerSubtotal += partnerUnitPrice * quantity;

    details.push({
      itemCode: item.itemCode,
      itemName: item.itemName,
      days: item.days,
      data: item.data,
      // A number here. The same value is a string on /api/items.
      price: unitPrice,
      quantity,
      partnerUnitPrice,
      partnerUnitDiscount,
      partnerLineAmount: lineAmount,
      links: '',
    });
  }

  const partnerOrderDiscount = numberOr(body.partnerOrderDiscount, 0);
  const orderDate = nowIso();
  const salesCode = newSalesCode();

  const order: StoredOrder = {
    salesCode,
    partnerOrderReference: reference,
    orderDate,
    requestDate: optionalString(body.requestDate),
    discountCode: optionalString(body.discountCode),
    salesStatus: 'Pending',
    paymentStatus: null,
    paymentDate: null,
    paymentMethod: null,
    orderType: 'eSIM',
    language: optionalString(body.language),
    total,
    partnerOrderSubtotal: partnerSubtotal,
    partnerOrderDiscount,
    partnerOrderTotal: partnerSubtotal - partnerOrderDiscount,
    shippingFirstname: optionalString(body.shippingFirstname),
    shippingLastname: optionalString(body.shippingLastname),
    shippingPhone,
    shippingEmail,
    shippingAddress: optionalString(body.shippingAddress),
    invoiceName: optionalString(body.invoiceName),
    invoiceEmail: optionalString(body.invoiceEmail),
    invoiceTaxCode: optionalString(body.invoiceTaxCode),
    invoiceAddress: optionalString(body.invoiceAddress),
    orderDetails: details,
    _internal: {
      // Fixed per order, so a client that latched onto one spelling on its
      // first call breaks on its second — which is the bug we want to catch.
      fulfilmentKeySpelling: Math.random() < 0.5 ? 'fulfillmentStatus' : 'fulfilmentStatus',
      lowercaseStatus: Math.random() < 0.5,
      activationValidityDays: activationValidityDaysFor(details[0]!.itemCode),
      fulfilmentTimer: null,
    },
  };

  setFulfilmentStatus(order, 'None');
  state.orders.set(salesCode, order);
  state.ordersByReference.set(reference, salesCode);
  state.save();

  // Both are valid per spec, so the client must not branch on 200.
  const httpStatus = Math.random() < config.createdStatusRate ? 201 : 200;
  return ok(res, toWire(order), 'Create order successfully', httpStatus);
});

// ── PUT /api/orders/{salesCode}/{confirmation} ───────────────────────────────

ordersRouter.put('/orders/:salesCode/:confirmation', (req, res) => {
  const { salesCode, confirmation } = req.params;
  const order = state.orders.get(salesCode!);

  if (!order) return fail(res, 404, `Resource not found, order ID: ${salesCode}`);
  if (confirmation !== 'confirmed' && confirmation !== 'canceled') {
    return fail(res, 400, 'Wrong argument');
  }

  // Anything past Pending has already been actioned once.
  if (order.salesStatus.toLowerCase() !== 'pending') {
    return fail(res, 430, ALREADY_HANDLED);
  }

  if (confirmation === 'canceled') {
    order.salesStatus = 'Canceled';
    state.save();
    return ok(res, toWire(order), 'Cancel order successfully');
  }

  // The failure that actually costs us money in production: we confirmed, they
  // refused, and a customer is waiting for an eSIM that will never arrive.
  if (state.balance < order.partnerOrderTotal) {
    return fail(res, 400, 'Insufficient balance');
  }

  state.balance -= order.partnerOrderTotal;
  order.salesStatus = 'Confirmed';
  order.paymentStatus = 'Authorized';
  order.paymentDate = nowIso();
  order.paymentMethod = 'Deposit';
  state.save();

  startFulfilment(order);

  return ok(res, toWire(order), 'Confirm order successfully');
});

// ── GET /api/orders ──────────────────────────────────────────────────────────

ordersRouter.get('/orders', (req, res) => {
  const search = str(req.query.search)?.toLowerCase();
  const salesStatus = str(req.query.salesStatus)?.toLowerCase();
  const orderType = str(req.query.orderType)?.toLowerCase();
  const from = str(req.query.fromOrderDate);
  const to = str(req.query.toOrderDate);

  const rows = [...state.orders.values()]
    .filter((order) => {
      if (search) {
        const haystack = [
          order.partnerOrderReference,
          order.salesCode,
          order.shippingFirstname,
          order.shippingLastname,
          order.shippingPhone,
          order.shippingEmail,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (salesStatus && order.salesStatus.toLowerCase() !== salesStatus) return false;
      if (orderType && order.orderType.toLowerCase() !== orderType) return false;
      if (from && order.orderDate < from) return false;
      if (to && order.orderDate > to) return false;
      return true;
    })
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .map(toWire);

  paginated(res, rows, req.query, 'Get orders successfully');
});

// ── POST /api/orders/topup ───────────────────────────────────────────────────

ordersRouter.post('/orders/topup', (req, res) => {
  const body = req.body as Record<string, unknown> | undefined;
  const iccid = optionalString(body?.iccid);
  const itemCode = optionalString(body?.itemCode);

  if (!iccid || !itemCode) return fail(res, 400, 'Wrong argument');
  if (!findItem(itemCode)) return fail(res, 404, `Resource not found, item ID: ${itemCode}`);

  return res.status(200).json({ statusCode: 200, message: 'Create topup order successfully' });
});

// ── Serialization ────────────────────────────────────────────────────────────

/**
 * Strips server-side bookkeeping and hides serials until fulfilment completes.
 * Before that they are absent, not empty — a client that reads
 * `orderDetails[0].serials[0]` optimistically will throw, which is the point.
 */
function toWire(order: StoredOrder): WireOrder {
  const { _internal, ...rest } = order;
  const completed = readFulfilmentStatus(order).toLowerCase() === 'completed';

  return {
    ...rest,
    orderDetails: order.orderDetails.map((detail) => {
      if (completed) return detail;
      const { serials, ...withoutSerials } = detail;
      return { ...withoutSerials, links: '' };
    }),
  };
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
