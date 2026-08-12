/**
 * Money is integer minor units. No floats anywhere in the money path.
 *
 * A `Cents` value is always a whole number of the currency's smallest unit
 * (cents for USD, riel for KHR — KHR has no subunit, so minor === major).
 * Every helper here rejects non-integers rather than rounding silently: a
 * fractional cent in the money path is a bug upstream, not something to
 * paper over at the point of use.
 */

export type Cents = number;

/** ISO-4217 codes we price in. */
export type Currency = 'USD' | 'KHR';

export class MoneyError extends Error {
  override name = 'MoneyError';
}

function assertCents(value: number, label: string): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer minor unit, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds safe integer range: ${value}`);
  }
}

/** Add amounts. Throws on any non-integer input. */
export function addCents(...amounts: Cents[]): Cents {
  let total = 0;
  for (const amount of amounts) {
    assertCents(amount, 'amount');
    total += amount;
  }
  assertCents(total, 'total');
  return total;
}

/** Multiply an amount by a whole quantity — the checkout line-total case. */
export function multiplyCents(unit: Cents, quantity: number): Cents {
  assertCents(unit, 'unit price');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new MoneyError(`quantity must be a positive integer, got ${quantity}`);
  }
  const total = unit * quantity;
  assertCents(total, 'line total');
  return total;
}

/**
 * Margin in basis points: 10000 bps === 100%.
 *
 * Basis points keep the margin check in integer arithmetic all the way to the
 * database constraint (`plans_margin_floor`), so the floor the SQL enforces and
 * the floor the application reports can never disagree by a rounding step.
 */
export function marginBps(sellCents: Cents, costCents: Cents): number {
  assertCents(sellCents, 'sell price');
  assertCents(costCents, 'cost price');
  if (sellCents <= 0) {
    throw new MoneyError(`sell price must be positive, got ${sellCents}`);
  }
  return Math.floor(((sellCents - costCents) * 10000) / sellCents);
}

/** The 15% floor enforced by `plans_margin_floor` on active plans. */
export const MARGIN_FLOOR_BPS = 1500;

/** Never sell below cost — mirrors the database constraint. */
export function meetsMarginFloor(sellCents: Cents, costCents: Cents): boolean {
  return marginBps(sellCents, costCents) >= MARGIN_FLOOR_BPS;
}

/** Display only. Never feed the result back into the money path. */
export function formatCents(amount: Cents, currency: Currency): string {
  assertCents(amount, 'amount');
  if (currency === 'KHR') {
    return `${amount.toLocaleString('en-US')} ៛`;
  }
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
