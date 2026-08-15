'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from '@/types';
// The server's cap, imported rather than repeated, so the browser can never
// build a basket lib/pricing.ts will refuse to price.
import { MAX_QUANTITY_PER_PLAN } from '@/lib/pricing';

interface CartState {
  items: CartItem[];
  referralCode: string | null;
  discountCode: string | null;
  discountPct: number;
  addItem: (item: CartItem) => void;
  removeItem: (planId: string) => void;
  setQuantity: (planId: string, quantity: number) => void;
  clear: () => void;
  setReferralCode: (code: string) => void;
  applyDiscount: (code: string) => boolean;
  subtotal: () => number;
  total: () => number;
  count: () => number;
}

// Static promo codes; referral codes from ?ref= apply the affiliate discount.
const DISCOUNT_CODES: Record<string, number> = {
  WELCOME10: 0.1,
  KHMERNEWYEAR: 0.15,
};
const REFERRAL_DISCOUNT_PCT = 0.05;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      referralCode: null,
      discountCode: null,
      discountPct: 0,

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.planId === item.planId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                // Capped here as well as on the server. Without this the cart
                // happily accepted an eleventh unit and the customer only
                // discovered the catalogue limit after choosing how to pay.
                i.planId === item.planId
                  ? { ...i, quantity: Math.min(MAX_QUANTITY_PER_PLAN, i.quantity + 1) }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        }),

      removeItem: (planId) =>
        set((state) => ({ items: state.items.filter((i) => i.planId !== planId) })),

      /** Zero removes the line, so the stepper's minus is also the delete. */
      setQuantity: (planId, quantity) =>
        set((state) => {
          const next = Math.min(MAX_QUANTITY_PER_PLAN, Math.max(0, Math.trunc(quantity)));
          if (next === 0) return { items: state.items.filter((i) => i.planId !== planId) };
          return {
            items: state.items.map((i) => (i.planId === planId ? { ...i, quantity: next } : i)),
          };
        }),

      clear: () => set({ items: [], discountCode: null, discountPct: 0 }),

      setReferralCode: (code) =>
        set((state) => ({
          referralCode: code,
          discountPct: state.discountCode ? state.discountPct : REFERRAL_DISCOUNT_PCT,
        })),

      applyDiscount: (code) => {
        const pct = DISCOUNT_CODES[code.trim().toUpperCase()];
        if (!pct) return false;
        set({ discountCode: code.trim().toUpperCase(), discountPct: pct });
        return true;
      },

      subtotal: () => get().items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0),
      total: () => get().subtotal() * (1 - get().discountPct),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: 'domner-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
