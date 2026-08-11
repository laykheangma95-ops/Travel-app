import { describe, expect, it } from 'vitest';
import { client, raw } from './helpers';

describe('balance', () => {
  it('parses a number out of the array envelope', async () => {
    const balance = await client.getBalance();

    expect(typeof balance.amount).toBe('number');
    expect(Number.isFinite(balance.amount)).toBe(true);
    expect(balance.amount).toBeGreaterThanOrEqual(0);
    expect(balance.currency).toBe('VND');
  });

  it('returns data as an array containing a string balance', async () => {
    const response = await raw('/balance');

    expect(response.status).toBe(200);
    // Both quirks in one assertion: `data` is an array, not an object, and the
    // balance inside it is a string. Reading `data.balance` gives undefined,
    // and a client that does so concludes we cannot afford any order.
    expect(Array.isArray(response.json.data)).toBe(true);

    const row = (response.json.data as Array<Record<string, unknown>>)[0]!;
    expect(typeof row.balance).toBe('string');
    expect(row.currencyCode).toBe('VND');
  });

  it('decreases when an order is confirmed', async () => {
    const { pickOrderableItem, orderInput, reference } = await import('./helpers');
    const item = await pickOrderableItem();

    const before = await client.getBalance();
    const created = await client.createOrder(orderInput(reference('DOMNER-BAL'), item));
    await client.confirmOrder(created.salesCode);
    const after = await client.getBalance();

    // Confirmation is what spends money. Creation must not.
    expect(after.amount).toBeLessThan(before.amount);
    expect(before.amount - after.amount).toBe(created.partnerTotalVnd);
  });
});
