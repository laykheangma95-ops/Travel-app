'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from '@/types';

interface CartState {
  items: CartItem[];
  referralCode: string | null;
  discountCode: string | null;
  discountPct: number;
  addItem: (item: CartItem) => void;
  removeItem: (planId: string) => void;
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
                i.planId === item.planId ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, item] };
        }),

      removeItem: (planId) =>
        set((state) => ({ items: state.items.filter((i) => i.planId !== planId) })),

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
