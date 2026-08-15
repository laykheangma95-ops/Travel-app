'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Tag } from 'lucide-react';
import { MAX_QUANTITY_PER_PLAN } from '@/lib/pricing';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { formatKhr, formatUsd } from '@/lib/utils';

export default function CartPage() {
  const cart = useCart();
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // Cart state lives in localStorage — render after mount to avoid hydration mismatch.
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="night-canvas min-h-screen" aria-busy="true" />;

  const subtotal = cart.subtotal();
  const total = cart.total();
  const discount = subtotal - total;

  const applyCode = () => {
    setCodeError(null);
    if (!cart.applyDiscount(code)) {
      setCodeError('This code is not valid or has expired.');
    }
  };

  return (
    // Night-sky funnel surface (see .claude/skills/ui-ux §9 concept continuity).
    <div className="night-canvas min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="mb-8 font-display text-3xl font-bold text-white">Your Cart</h1>

        {cart.items.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Browse our eSIM store and add a plan for your next destination."
            ctaLabel="Browse eSIM plans"
            ctaHref="/esim"
            dark
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-5">
            {/* Items */}
            <div className="space-y-4 lg:col-span-3">
              {cart.items.map((item) => (
                <div key={item.planId} className="night-card flex items-center gap-4 p-5">
                  <WavyFlag flag={item.flag} label={`${item.countryName} flag`} size={52} />
                  <div className="flex-1">
                    <p className="font-display font-bold text-white">
                      {item.countryName} — {item.planName}
                    </p>
                    <p className="text-sm text-white/65">
                      {item.durationDays} days ·{' '}
                      {item.dataType === 'daily'
                        ? `${item.dataGbDaily}GB/day`
                        : `${item.dataGbTotal}GB total`}
                      {item.quantity > 1 && ` · ×${item.quantity}`}
                    </p>
                  </div>
                  {/* The cart showed "×2" and offered no way to change it —
                      only remove and start again. */}
                  <div className="flex items-center gap-1 rounded-btn border border-white/12">
                    <button
                      type="button"
                      onClick={() => cart.setQuantity(item.planId, item.quantity - 1)}
                      aria-label={`One fewer ${item.countryName} ${item.planName}`}
                      className="grid h-10 w-10 place-items-center rounded-btn text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                    >
                      <Minus size={15} aria-hidden="true" />
                    </button>
                    <span
                      className="min-w-[1.5rem] text-center font-mono text-sm tabular-nums text-white"
                      aria-live="polite"
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.setQuantity(item.planId, item.quantity + 1)}
                      disabled={item.quantity >= MAX_QUANTITY_PER_PLAN}
                      aria-label={`One more ${item.countryName} ${item.planName}`}
                      className="grid h-10 w-10 place-items-center rounded-btn text-white/70 transition-colors hover:text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="w-20 text-right font-mono font-bold text-white">
                    {formatUsd(item.priceUsd * item.quantity)}
                  </p>
                  <button
                    type="button"
                    onClick={() => cart.removeItem(item.planId)}
                    aria-label={`Remove ${item.countryName} ${item.planName} from cart`}
                    className="rounded-btn p-2 text-white/50 transition-colors hover:bg-danger/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="lg:col-span-2">
              <div className="night-card sticky top-24 p-6">
                <h2 className="font-display text-lg font-bold text-white">Order Summary</h2>

                <div className="mt-5 space-y-3 border-b border-white/10 pb-5 text-sm">
                  <div className="flex justify-between text-white/70">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatUsd(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between font-medium text-emerald-300">
                      <span>
                        Discount {cart.discountCode ?? (cart.referralCode ? `(ref: ${cart.referralCode})` : '')}
                      </span>
                      <span className="font-mono">-{formatUsd(discount)}</span>
                    </div>
                  )}
                </div>

                {/* Discount code */}
                <div className="mt-5">
                  <label htmlFor="discount" className="text-sm font-medium text-white/80">
                    Discount code
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="discount"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g. WELCOME10"
                      className="min-h-[2.75rem] flex-1 rounded-btn border border-gold-light/20 bg-white/5 px-3.5 py-2.5 text-sm uppercase text-white placeholder:text-white/40 backdrop-blur-md focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/25"
                    />
                    <Button variant="outline-light" size="md" onClick={applyCode}>
                      <Tag size={14} /> Apply
                    </Button>
                  </div>
                  {codeError && <p className="mt-1.5 text-xs text-red-300" role="alert">{codeError}</p>}
                  {cart.referralCode && (
                    <p className="mt-1.5 text-xs text-emerald-300">
                      Referral code {cart.referralCode} applied automatically.
                    </p>
                  )}
                </div>

                <div className="mt-6 space-y-1 border-t border-white/10 pt-5">
                  <div className="flex justify-between font-display text-xl font-bold text-white">
                    <span>Total</span>
                    <span className="font-mono">{formatUsd(total)}</span>
                  </div>
                  <p className="text-right text-xs text-white/50">≈ {formatKhr(total)} KHR</p>
                </div>

                <Button href="/esim/checkout" variant="liquid-accent" size="lg" className="mt-6 w-full">
                  Proceed to Checkout
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
