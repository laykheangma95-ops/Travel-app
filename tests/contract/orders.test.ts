import { beforeAll, describe, expect, it } from 'vitest';
import {
  GohubDuplicateError,
  GohubNotFoundError,
  GohubValidationError,
} from '@/lib/gohub/errors';
import { client, devApi, isMock, orderInput, pickOrderableItem, raw, reference } from './helpers';

let item: Awaited<ReturnType<typeof pickOrderableItem>>;

beforeAll(async () => {
  item = await pickOrderableItem();
});

describe('order creation', () => {
  it('returns a salesCode and Pending status', async () => {
    const order = await client.createOrder(orderInput(reference('DOMNER'), item));

    expect(order.salesCode).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(order.salesStatus).toBe('pending');
    expect(order.paymentStatus).toBeNull();
    expect(order.paymentDate).toBeNull();
    expect(order.fulfilmentStatus).toBe('none');
    expect(order.orderType).toBe('eSIM');

    // Prices come back as numbers here and strings from /items; both normalize.
    expect(order.lines[0]!.priceVnd).toBe(item.priceVnd);
    expect(order.totalVnd).toBeGreaterThan(0);
  });

  it('accepts either 200 or 201 as success', async () => {
    // The status alternates at random upstream, so the only assertion that
    // means anything is that a run of orders all succeed.
    const statuses = new Set<number>();

    for (let i = 0; i < 6; i += 1) {
      const response = await raw('/orders', {
        method: 'POST',
        body: JSON.stringify(orderInput(reference('DOMNER-STATUS'), item)),
      });
      expect([200, 201]).toContain(response.status);
      statuses.add(response.status);
      expect(response.json.statusCode).toBe(200);
    }
  });

  it('rejects a duplicate partnerOrderReference with 430', async () => {
    const partnerReference = reference('DOMNER-DUP');
    const first = await client.createOrder(orderInput(partnerReference, item));
    expect(first.salesCode).toBeTruthy();

    await expect(client.createOrder(orderInput(partnerReference, item))).rejects.toBeInstanceOf(
      GohubDuplicateError
    );

    const response = await raw('/orders', {
      method: 'POST',
      body: JSON.stringify(orderInput(partnerReference, item)),
    });
    expect(response.status).toBe(430);

    // The duplicate is a signal that the order EXISTS. Recovering it, rather
    // than minting a new reference, is what stops a customer being charged twice.
    const recovered = await client.getOrderByReference(partnerReference);
    expect(recovered?.salesCode).toBe(first.salesCode);
  });

  it('rejects an unknown itemCode with 404', async () => {
    const input = orderInput(reference('DOMNER-BADITEM'), item);
    input.orderDetails[0]!.itemCode = 'THIS_ITEM_DOES_NOT_EXIST';

    await expect(client.createOrder(input)).rejects.toBeInstanceOf(GohubNotFoundError);
  });

  it('rejects a bad quantity with 400', async () => {
    for (const quantity of [0, -1, 1.5]) {
      const input = orderInput(reference('DOMNER-BADQTY'), item);
      input.orderDetails[0]!.quantity = quantity;
      await expect(client.createOrder(input)).rejects.toBeInstanceOf(GohubValidationError);
    }
  });

  it('rejects a malformed email with 400', async () => {
    const input = orderInput(reference('DOMNER-BADMAIL'), item);
    input.shippingEmail = 'sokha-at-example-dot-com';

    await expect(client.createOrder(input)).rejects.toBeInstanceOf(GohubValidationError);
  });

  it('rejects a malformed phone with 400', async () => {
    const input = orderInput(reference('DOMNER-BADPHONE'), item);
    input.shippingPhone = 'call me maybe';

    await expect(client.createOrder(input)).rejects.toBeInstanceOf(GohubValidationError);
  });
});

describe('order confirmation', () => {
  it('transitions to Confirmed / Authorized', async () => {
    const created = await client.createOrder(orderInput(reference('DOMNER-CONF'), item));
    const confirmed = await client.confirmOrder(created.salesCode);

    expect(confirmed.salesStatus).toBe('confirmed');
    expect(confirmed.paymentStatus).toBe('Authorized');
    expect(confirmed.paymentDate).not.toBeNull();
  });

  it('transitions to Canceled', async () => {
    const created = await client.createOrder(orderInput(reference('DOMNER-CANCEL'), item));
    const canceled = await client.cancelOrder(created.salesCode);

    expect(canceled.salesStatus).toBe('canceled');
    expect(canceled.paymentStatus).toBeNull();
  });

  it('rejects a second action on the same order with 430', async () => {
    const created = await client.createOrder(orderInput(reference('DOMNER-REACT'), item));
    await client.cancelOrder(created.salesCode);

    await expect(client.cancelOrder(created.salesCode)).rejects.toBeInstanceOf(
      GohubDuplicateError
    );
    await expect(client.confirmOrder(created.salesCode)).rejects.toBeInstanceOf(
      GohubDuplicateError
    );
  });

  it('rejects an unknown salesCode with 404', async () => {
    await expect(client.confirmOrder('ZZZZZZZZZZ')).rejects.toBeInstanceOf(GohubNotFoundError);
  });

  it('reads the fulfilment status under either spelling', async () => {
    // The API emits `fulfillmentStatus` on some orders and `fulfilmentStatus`
    // on others. Every order must normalize to a known value regardless.
    const orders = await client.getOrders({ perPage: 50 });
    expect(orders.rows.length).toBeGreaterThan(0);

    for (const order of orders.rows) {
      expect(['none', 'processing', 'completed', 'failed']).toContain(order.fulfilmentStatus);
    }
  });

  it('compares sales status case-insensitively', async () => {
    const orders = await client.getOrders({ perPage: 50 });

    for (const order of orders.rows) {
      expect(order.salesStatus).toBe(order.salesStatus.toLowerCase());
      expect(['pending', 'confirmed', 'processing', 'canceled']).toContain(order.salesStatus);
    }
  });
});

describe('insufficient balance', () => {
  it('blocks confirmation and leaves the order unconfirmed', async ({ skip }) => {
    if (!(await isMock())) {
      // Staging has a real balance we must not drain; this case is mock-only.
      skip();
      return;
    }

    const created = await client.createOrder(orderInput(reference('DOMNER-BROKE'), item));

    await devApi.setBalance(0);
    try {
      const response = await raw(`/orders/${created.salesCode}/confirmed`, { method: 'PUT' });

      expect(response.status).toBe(400);
      expect(response.json.message).toBe('Insufficient balance');

      // The important half of the assertion: a refused confirmation must not
      // leave the order looking confirmed. A customer paid us; if we think this
      // order is live and it is not, nobody goes looking for it.
      const after = await client.getOrderBySalesCode(created.salesCode);
      expect(after?.salesStatus).toBe('pending');
      expect(after?.paymentStatus).toBeNull();
    } finally {
      await devApi.setBalance(5_000_000);
    }
  });
});
