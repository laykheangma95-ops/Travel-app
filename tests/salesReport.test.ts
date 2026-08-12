import { describe, expect, it } from 'vitest';
import {
  accumulate,
  buildReport,
  centsToAmount,
  isoWeek,
  marginBpsOf,
  toCents,
} from '@/lib/reports/sales';

// What this file is really guarding: a sales statement that is wrong is worse
// than no sales statement, because it gets believed. The two ways it goes
// wrong are floating-point drift across many rows, and treating an unknown
// supplier cost as zero — which reports a 100% margin on every legacy order.

type Order = Parameters<typeof accumulate>[1];

function order(partial: Partial<Order> = {}): Order {
  return {
    status: 'paid',
    price_usd: 10,
    subtotal_usd: 10,
    discount_usd: 0,
    cost_usd: 6,
    created_at: '2026-08-12T10:00:00Z',
    paid_at: '2026-08-12T10:00:00Z',
    items: [{ quantity: 1 }],
    ...partial,
  } as Order;
}

describe('toCents', () => {
  it('converts decimals without floating-point drift', () => {
    expect(toCents(25.99)).toBe(2599);
    expect(toCents('25.99')).toBe(2599);
    expect(toCents(0.1)).toBe(10);
  });

  it('treats null and unparseable values as zero rather than NaN', () => {
    // A NaN here would silently poison every downstream sum.
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents('not a number')).toBe(0);
    expect(toCents(Infinity)).toBe(0);
  });

  it('survives summing many awkward amounts', () => {
    let cents = 0;
    for (let i = 0; i < 3000; i += 1) cents += toCents(0.1) + toCents(0.2);
    // The same loop in floats lands on 899.9999999999 and change.
    expect(cents).toBe(90_000);
    expect(centsToAmount(cents)).toBe(900);
  });
});

describe('marginBpsOf', () => {
  it('reports margin in basis points', () => {
    expect(marginBpsOf(10_000, 8_500)).toBe(1500); // 15.00%
    expect(marginBpsOf(2599, 1500)).toBe(4229);
  });

  it('returns null rather than zero when there is nothing to divide by', () => {
    expect(marginBpsOf(0, 0)).toBeNull();
    expect(marginBpsOf(-100, 0)).toBeNull();
  });
});

describe('isoWeek', () => {
  it('handles the year boundary the way ISO-8601 does', () => {
    // 1 Jan 2027 is a Friday, so it belongs to week 53 of 2026.
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date('2026-08-12T00:00:00Z'))).toEqual({ year: 2026, week: 33 });
  });

  it('does not shift the week based on time of day', () => {
    expect(isoWeek(new Date('2026-08-12T23:59:00Z'))).toEqual(
      isoWeek(new Date('2026-08-12T00:01:00Z'))
    );
  });
});

describe('accumulate', () => {
  it('counts only settled money as sales', () => {
    const report = buildReport(
      [
        order({ status: 'paid' }),
        order({ status: 'fulfilled' }),
        order({ status: 'pending' }),
        order({ status: 'cancelled' }),
      ],
      'all'
    );

    expect(report.total.orders).toBe(2);
    expect(report.total.netSalesCents).toBe(2000);
  });

  it('books refunds separately instead of netting them off sales', () => {
    const report = buildReport([order(), order({ status: 'refunded', price_usd: 10 })], 'all');

    expect(report.total.orders).toBe(1);
    expect(report.total.netSalesCents).toBe(1000);
    expect(report.total.refunds).toBe(1);
    expect(report.total.refundsCents).toBe(1000);
  });

  it('excludes unknown-cost orders from COGS and margin rather than treating them as free', () => {
    const report = buildReport(
      [
        order({ price_usd: 10, cost_usd: 6 }),
        order({ price_usd: 10, cost_usd: null }),
      ],
      'all'
    );

    expect(report.total.orders).toBe(2);
    expect(report.total.netSalesCents).toBe(2000);
    // COGS and margin see only the costed order: $10 net, $6 cost → 40%.
    expect(report.total.cogsCents).toBe(600);
    expect(report.total.costedNetSalesCents).toBe(1000);
    expect(report.total.grossProfitCents).toBe(400);
    expect(report.total.marginBps).toBe(4000);
    expect(report.total.ordersMissingCost).toBe(1);
    expect(report.hasIncompleteCost).toBe(true);
  });

  it('reports a null margin when no order has a cost, never 0%', () => {
    const report = buildReport([order({ cost_usd: null })], 'all');

    expect(report.total.marginBps).toBeNull();
    expect(report.total.cogsCents).toBe(0);
  });

  it('falls back to price when a legacy row has no subtotal', () => {
    // Rows written before subtotal_usd existed default it to 0; gross must
    // never read as less than net.
    const report = buildReport([order({ subtotal_usd: 0, price_usd: 25.99 })], 'all');

    expect(report.total.grossSalesCents).toBe(2599);
    expect(report.total.netSalesCents).toBe(2599);
  });
});

describe('buildReport grouping', () => {
  it('recognises revenue in the period the money settled, not when checkout started', () => {
    // Created 31 July, paid 1 August — August revenue.
    const report = buildReport(
      [order({ created_at: '2026-07-31T23:00:00Z', paid_at: '2026-08-01T01:00:00Z' })],
      'monthly'
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].periodKey).toBe('2026-08');
  });

  it('groups by ISO week and sorts newest first', () => {
    const report = buildReport(
      [
        order({ paid_at: '2026-08-12T10:00:00Z' }), // week 33
        order({ paid_at: '2026-08-05T10:00:00Z' }), // week 32
        order({ paid_at: '2026-08-06T10:00:00Z' }), // week 32
      ],
      'weekly'
    );

    expect(report.rows.map((r) => r.periodKey)).toEqual(['2026-W33', '2026-W32']);
    expect(report.rows[0].orders).toBe(1);
    expect(report.rows[1].orders).toBe(2);
  });

  it('collapses everything into one row for the all-time period', () => {
    const report = buildReport(
      [order({ paid_at: '2025-01-01T00:00:00Z' }), order({ paid_at: '2026-08-12T00:00:00Z' })],
      'all'
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].orders).toBe(2);
  });

  it('keeps the total consistent with the sum of its periods', () => {
    const orders = [
      order({ paid_at: '2026-08-12T10:00:00Z', price_usd: 25.99, cost_usd: 15.5 }),
      order({ paid_at: '2026-07-02T10:00:00Z', price_usd: 12.5, cost_usd: 7.25 }),
      order({ paid_at: '2026-06-02T10:00:00Z', price_usd: 9.99, cost_usd: null }),
    ];
    const report = buildReport(orders, 'monthly');

    const summed = report.rows.reduce((sum, row) => sum + row.netSalesCents, 0);
    expect(summed).toBe(report.total.netSalesCents);
    expect(report.total.netSalesCents).toBe(2599 + 1250 + 999);
    expect(report.total.cogsCents).toBe(1550 + 725);
  });
});
