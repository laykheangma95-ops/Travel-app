// ─────────────────────────────────────────────────────────────────────────────
// Server-authoritative pricing.
//
// WHY THIS EXISTS:
//   The checkout used to send `totalUsd` from the browser and the payment route
//   charged exactly that. The cart lives in localStorage, so anyone could edit
//   a $25.99 plan down to $0.50 in devtools and pay the lower price.
//
// THE RULE:
//   The client sends INTENT — which plan, how many, which promo code.
//   The server sends the PRICE. A price that arrives from a browser is only
//   ever used to detect tampering, never to charge.
//
//   Every number a customer is charged originates in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { getPlan } from '@/data/esimPlans';
import { destinations } from '@/data/destinations';
import type { CartItem } from '@/types';

/** Maximum units of a single plan in one order — blocks absurd/abusive totals. */
export const MAX_QUANTITY_PER_PLAN = 10;
/** Maximum distinct plans in one order. */
export const MAX_LINE_ITEMS = 20;
/** Orders above this need manual review; the gateway would flag them anyway. */
export const MAX_ORDER_TOTAL_USD = 2000;

/** Promo codes and their discount fraction. Server-side only — the browser copy is cosmetic. */
export const DISCOUNT_CODES: Record<string, number> = {
  WELCOME10: 0.1,
  KHMERNEWYEAR: 0.15,
};

/** Discount applied when an order arrives through an affiliate referral link. */
export const REFERRAL_DISCOUNT_PCT = 0.05;

/** Discounts never stack past this, no matter what combination arrives. */
export const MAX_DISCOUNT_PCT = 0.3;

/** What the client is allowed to ask for: a plan and a quantity. Nothing else. */
export interface RequestedLine {
  planId: string;
  quantity: number;
}

/** A line item after the server has priced it. */
export interface PricedLine {
  planId: string;
  countrySlug: string;
  countryName: string;
  flag: string;
  planName: string;
  tier: string;
  durationDays: number;
  dataType: 'daily' | 'fixed';
  dataGbDaily: number;
  dataGbTotal: number;
  /** Authoritative unit price from the catalog. */
  unitPriceUsd: number;
  quantity: number;
  /** unitPriceUsd × quantity, rounded to cents. */
  lineTotalUsd: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotalUsd: number;
  discountPct: number;
  discountUsd: number;
  totalUsd: number;
  /** Total in the smallest currency unit — what actually goes to the gateway. */
  totalCents: number;
  appliedDiscountCode: string | null;
  appliedReferralCode: string | null;
  /** Human summaries reused by the order record, emails and admin panel. */
  countrySummary: string;
  planSummary: string;
}

export class PricingError extends Error {
  readonly code:
    | 'EMPTY_CART'
    | 'TOO_MANY_ITEMS'
    | 'UNKNOWN_PLAN'
    | 'INVALID_QUANTITY'
    | 'DUPLICATE_PLAN'
    | 'TOTAL_TOO_LARGE';

  constructor(code: PricingError['code'], message: string) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

/** Money is decimal; floating point is not. Every total passes through here. */
export function roundCents(usd: number): number {
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

export function toCents(usd: number): number {
  return Math.round(usd * 100);
}

const destinationBySlug = new Map(destinations.map((d) => [d.slug, d]));

/**
 * Normalizes whatever the client sent into a plain list of {planId, quantity}.
 * Accepts full cart items too, so an older client that still posts price fields
 * keeps working — the price fields are simply ignored.
 */
export function normalizeLines(input: unknown): RequestedLine[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<CartItem> & Partial<RequestedLine>;
    if (typeof item.planId !== 'string' || !item.planId.trim()) return [];
    const quantity = Number(item.quantity ?? 1);
    return [{ planId: item.planId.trim(), quantity }];
  });
}

/** Resolves a promo/referral pair to a single discount fraction. */
export function resolveDiscount(
  discountCode: string | null | undefined,
  referralCode: string | null | undefined
): { pct: number; appliedDiscountCode: string | null; appliedReferralCode: string | null } {
  const normalizedDiscount = discountCode?.trim().toUpperCase() || null;
  const normalizedReferral = referralCode?.trim().toUpperCase() || null;

  const promoPct = normalizedDiscount ? (DISCOUNT_CODES[normalizedDiscount] ?? 0) : 0;
  const referralPct = normalizedReferral ? REFERRAL_DISCOUNT_PCT : 0;

  // A valid promo code wins over the smaller referral discount; they never stack.
  const pct = Math.min(Math.max(promoPct, referralPct), MAX_DISCOUNT_PCT);

  return {
    pct,
    appliedDiscountCode: promoPct > 0 ? normalizedDiscount : null,
    // The referral is still recorded for affiliate attribution even when the
    // promo code gave the better rate.
    appliedReferralCode: normalizedReferral,
  };
}

/**
 * Prices an order from the catalog. This is the only function permitted to
 * decide what a customer pays.
 *
 * @throws PricingError on any input the catalog cannot vouch for.
 */
export function priceOrder(params: {
  lines: RequestedLine[];
  discountCode?: string | null;
  referralCode?: string | null;
}): PricedOrder {
  const { lines } = params;

  if (lines.length === 0) {
    throw new PricingError('EMPTY_CART', 'Your cart is empty.');
  }
  if (lines.length > MAX_LINE_ITEMS) {
    throw new PricingError('TOO_MANY_ITEMS', `An order can contain at most ${MAX_LINE_ITEMS} plans.`);
  }

  const seen = new Set<string>();
  const priced: PricedLine[] = lines.map((line) => {
    if (seen.has(line.planId)) {
      throw new PricingError('DUPLICATE_PLAN', `Plan ${line.planId} appears twice in the order.`);
    }
    seen.add(line.planId);

    const plan = getPlan(line.planId);
    if (!plan) {
      throw new PricingError('UNKNOWN_PLAN', `We no longer offer the plan ${line.planId}.`);
    }

    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY_PER_PLAN) {
      throw new PricingError(
        'INVALID_QUANTITY',
        `Quantity for ${plan.name} must be a whole number between 1 and ${MAX_QUANTITY_PER_PLAN}.`
      );
    }

    const destination = destinationBySlug.get(plan.countrySlug);

    return {
      planId: plan.id,
      countrySlug: plan.countrySlug,
      countryName: destination?.name ?? plan.countrySlug,
      flag: destination?.flag ?? '',
      planName: plan.name,
      tier: plan.tier,
      durationDays: plan.durationDays,
      dataType: plan.dataType,
      dataGbDaily: plan.dataGbDaily,
      dataGbTotal: plan.dataGbTotal,
      unitPriceUsd: plan.priceUsd,
      quantity: line.quantity,
      lineTotalUsd: roundCents(plan.priceUsd * line.quantity),
    };
  });

  const subtotalUsd = roundCents(priced.reduce((sum, l) => sum + l.lineTotalUsd, 0));
  const { pct, appliedDiscountCode, appliedReferralCode } = resolveDiscount(
    params.discountCode,
    params.referralCode
  );

  const discountUsd = roundCents(subtotalUsd * pct);
  const totalUsd = roundCents(subtotalUsd - discountUsd);

  if (totalUsd > MAX_ORDER_TOTAL_USD) {
    throw new PricingError(
      'TOTAL_TOO_LARGE',
      `Orders above $${MAX_ORDER_TOTAL_USD} need to be arranged with our team.`
    );
  }

  return {
    lines: priced,
    subtotalUsd,
    discountPct: pct,
    discountUsd,
    totalUsd,
    totalCents: toCents(totalUsd),
    appliedDiscountCode,
    appliedReferralCode,
    countrySummary: priced.map((l) => l.countryName).join(', '),
    planSummary: priced.map((l) => `${l.countryName} ${l.planName}`).join(', '),
  };
}

/**
 * Compares the price the browser displayed against the price the server
 * computed. A mismatch is not fatal — the customer simply pays the server
 * price — but it is worth logging, because a persistent gap means the catalog
 * changed mid-session or someone is probing the checkout.
 */
export function detectPriceMismatch(clientTotal: unknown, serverTotal: number): number | null {
  if (typeof clientTotal !== 'number' || !Number.isFinite(clientTotal)) return null;
  const delta = roundCents(Math.abs(clientTotal - serverTotal));
  return delta > 0.01 ? delta : null;
}
