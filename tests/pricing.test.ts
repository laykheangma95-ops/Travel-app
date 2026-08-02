import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_CODES,
  MAX_ORDER_TOTAL_USD,
  MAX_QUANTITY_PER_PLAN,
  REFERRAL_DISCOUNT_PCT,
  PricingError,
  detectPriceMismatch,
  normalizeLines,
  priceOrder,
  resolveDiscount,
  roundCents,
  toCents,
} from '@/lib/pricing';
import { esimPlans, getPlan } from '@/data/esimPlans';

// The regression this file exists for: the checkout used to send `totalUsd`
// from the browser and the payment route charged exactly that, so a $25.99 plan
// could be bought for $0.50 by editing localStorage.

const samplePlan = esimPlans[0];
const premiumPlan = esimPlans.find((p) => p.tier === 'premium')!;

describe('priceOrder', () => {
  it('prices from the catalog, ignoring anything the client claims', () => {
    const order = priceOrder({ lines: [{ planId: samplePlan.id, quantity: 1 }] });

    expect(order.totalUsd).toBe(samplePlan.priceUsd);
    expect(order.lines[0].unitPriceUsd).toBe(samplePlan.priceUsd);
  });

  it('ignores price fields smuggled in on the line items', () => {
    // A tampered cart: the client sends its own priceUsd alongside the planId.
    const tampered = normalizeLines([
      { planId: premiumPlan.id, quantity: 1, priceUsd: 0.5, unitPriceUsd: 0.5 },
    ]);

    const order = priceOrder({ lines: tampered });

    expect(order.totalUsd).toBe(premiumPlan.priceUsd);
    expect(order.totalUsd).toBeGreaterThan(0.5);
  });

  it('multiplies by quantity', () => {
    const order = priceOrder({ lines: [{ planId: samplePlan.id, quantity: 3 }] });
    expect(order.totalUsd).toBe(roundCents(samplePlan.priceUsd * 3));
  });

  it('sums multiple line items', () => {
    const order = priceOrder({
      lines: [
        { planId: samplePlan.id, quantity: 1 },
        { planId: premiumPlan.id, quantity: 2 },
      ],
    });

    expect(order.subtotalUsd).toBe(
      roundCents(samplePlan.priceUsd + premiumPlan.priceUsd * 2)
    );
  });

  it('produces an integer cent amount for the gateway', () => {
    const order = priceOrder({ lines: [{ planId: samplePlan.id, quantity: 3 }] });
    expect(Number.isInteger(order.totalCents)).toBe(true);
    expect(order.totalCents).toBe(toCents(order.totalUsd));
  });

  it('rejects an unknown plan rather than inventing a price', () => {
    expect(() => priceOrder({ lines: [{ planId: 'not-a-plan', quantity: 1 }] })).toThrow(
      PricingError
    );
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_QUANTITY_PER_PLAN + 1])(
    'rejects quantity %s',
    (quantity) => {
      expect(() =>
        priceOrder({ lines: [{ planId: samplePlan.id, quantity: quantity as number }] })
      ).toThrow(PricingError);
    }
  );

  it('rejects a negative quantity that would produce a credit', () => {
    try {
      priceOrder({ lines: [{ planId: samplePlan.id, quantity: -5 }] });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PricingError);
      expect((error as PricingError).code).toBe('INVALID_QUANTITY');
    }
  });

  it('rejects an empty cart', () => {
    expect(() => priceOrder({ lines: [] })).toThrow(PricingError);
  });

  it('rejects the same plan listed twice', () => {
    expect(() =>
      priceOrder({
        lines: [
          { planId: samplePlan.id, quantity: 1 },
          { planId: samplePlan.id, quantity: 1 },
        ],
      })
    ).toThrow(PricingError);
  });

  it('caps the order total', () => {
    const lines = esimPlans.slice(0, 20).map((plan) => ({
      planId: plan.id,
      quantity: MAX_QUANTITY_PER_PLAN,
    }));

    // Only meaningful if the catalog can actually exceed the cap.
    const uncapped = lines.reduce(
      (sum, line) => sum + getPlan(line.planId)!.priceUsd * line.quantity,
      0
    );

    if (uncapped > MAX_ORDER_TOTAL_USD) {
      expect(() => priceOrder({ lines })).toThrow(PricingError);
    }
  });
});

describe('discounts', () => {
  it('applies a known promo code', () => {
    const order = priceOrder({
      lines: [{ planId: premiumPlan.id, quantity: 1 }],
      discountCode: 'WELCOME10',
    });

    expect(order.discountPct).toBe(DISCOUNT_CODES.WELCOME10);
    expect(order.totalUsd).toBe(roundCents(premiumPlan.priceUsd * 0.9));
  });

  it('ignores an invented promo code', () => {
    const order = priceOrder({
      lines: [{ planId: premiumPlan.id, quantity: 1 }],
      discountCode: 'FREEMONEY99',
    });

    expect(order.discountPct).toBe(0);
    expect(order.totalUsd).toBe(premiumPlan.priceUsd);
  });

  it('never stacks a promo code with a referral', () => {
    const { pct } = resolveDiscount('KHMERNEWYEAR', 'SOKHA30');
    expect(pct).toBe(DISCOUNT_CODES.KHMERNEWYEAR);
    expect(pct).toBeLessThan(DISCOUNT_CODES.KHMERNEWYEAR + REFERRAL_DISCOUNT_PCT);
  });

  it('still records the referral when the promo code wins', () => {
    const order = priceOrder({
      lines: [{ planId: premiumPlan.id, quantity: 1 }],
      discountCode: 'KHMERNEWYEAR',
      referralCode: 'sokha30',
    });

    expect(order.appliedDiscountCode).toBe('KHMERNEWYEAR');
    expect(order.appliedReferralCode).toBe('SOKHA30');
  });

  it('applies the referral discount on its own', () => {
    const order = priceOrder({
      lines: [{ planId: premiumPlan.id, quantity: 1 }],
      referralCode: 'SOKHA30',
    });

    expect(order.discountPct).toBe(REFERRAL_DISCOUNT_PCT);
  });

  it('never produces a negative total', () => {
    const order = priceOrder({
      lines: [{ planId: samplePlan.id, quantity: 1 }],
      discountCode: 'KHMERNEWYEAR',
    });

    expect(order.totalUsd).toBeGreaterThan(0);
  });
});

describe('normalizeLines', () => {
  it('drops entries with no planId', () => {
    expect(normalizeLines([{ quantity: 2 }, { planId: '', quantity: 1 }])).toEqual([]);
  });

  it('defaults a missing quantity to 1', () => {
    expect(normalizeLines([{ planId: 'x' }])).toEqual([{ planId: 'x', quantity: 1 }]);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeLines(null)).toEqual([]);
    expect(normalizeLines('vietnam-basic')).toEqual([]);
  });
});

describe('detectPriceMismatch', () => {
  it('flags a client total that disagrees with the server', () => {
    expect(detectPriceMismatch(0.5, 25.99)).toBeCloseTo(25.49, 2);
  });

  it('tolerates sub-cent float noise', () => {
    expect(detectPriceMismatch(9.99, 9.990000001)).toBeNull();
  });

  it('ignores a missing or non-numeric client total', () => {
    expect(detectPriceMismatch(undefined, 9.99)).toBeNull();
    expect(detectPriceMismatch('9.99', 9.99)).toBeNull();
  });
});

describe('roundCents', () => {
  it('resolves classic float drift', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(1.005)).toBe(1.01);
  });
});
