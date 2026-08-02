import { describe, expect, it } from 'vitest';
import { canTransition } from '@/lib/orders';
import type { OrderStatus } from '@/types';

// The regression this file exists for: order status was set with a bare
// `.update({ status })`, so a redelivered Stripe webhook re-ran every side
// effect — a second confirmation email, a second admin alert — and a cancelled
// order could be flipped back to paid.

describe('order status transitions', () => {
  it('allows the normal path: pending → paid → fulfilled', () => {
    expect(canTransition('pending', 'paid')).toBe(true);
    expect(canTransition('paid', 'fulfilled')).toBe(true);
  });

  it('allows cancelling a pending order', () => {
    expect(canTransition('pending', 'cancelled')).toBe(true);
  });

  it('allows refunding after payment or fulfilment', () => {
    expect(canTransition('paid', 'refunded')).toBe(true);
    expect(canTransition('fulfilled', 'refunded')).toBe(true);
  });

  it('refuses to fulfil an order that was never paid', () => {
    expect(canTransition('pending', 'fulfilled')).toBe(false);
  });

  it('refuses to resurrect a cancelled order', () => {
    expect(canTransition('cancelled', 'paid')).toBe(false);
    expect(canTransition('cancelled', 'fulfilled')).toBe(false);
  });

  it('treats refunded and cancelled as terminal', () => {
    const terminal: OrderStatus[] = ['cancelled', 'refunded'];
    const all: OrderStatus[] = ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'];

    for (const from of terminal) {
      for (const to of all) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('refuses a self-transition, so a replayed webhook is a no-op', () => {
    const all: OrderStatus[] = ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'];
    for (const status of all) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('refuses to walk backwards from fulfilled to paid', () => {
    expect(canTransition('fulfilled', 'paid')).toBe(false);
  });
});
