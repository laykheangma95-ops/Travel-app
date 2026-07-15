'use client';

import { useEffect, useState } from 'react';
import { Trash2, ShoppingCart, Tag } from 'lucide-react';
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
  if (!mounted) return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-busy="true" />;

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
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 font-display text-3xl font-bold text-ink">Your Cart</h1>

      {cart.items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Browse our eSIM store and add a plan for your next destination."
          ctaLabel="Browse eSIM plans"
          ctaHref="/esim"
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Items */}
          <div className="space-y-4 lg:col-span-3">
            {cart.items.map((item) => (
              <div
                key={item.planId}
                className="flex items-center gap-4 rounded-card border border-line/60 bg-white p-5 shadow-card"
              >
                <WavyFlag flag={item.flag} label={`${item.countryName} flag`} size={52} />
                <div className="flex-1">
                  <p className="font-display font-bold text-ink">
                    {item.countryName} — {item.planName}
                  </p>
                  <p className="text-sm text-ink-secondary">
                    {item.durationDays} days · {item.dataGbDaily}GB/day
                    {item.quantity > 1 && ` · ×${item.quantity}`}
                  </p>
                </div>
                <p className="font-display font-bold text-ink">
                  {formatUsd(item.priceUsd * item.quantity)}
                </p>
                <button
                  type="button"
                  onClick={() => cart.removeItem(item.planId)}
                  aria-label={`Remove ${item.countryName} ${item.planName} from cart`}
                  className="rounded-btn p-2 text-ink-muted transition-colors hover:bg-red-50 hover:text-danger"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 rounded-card border border-line/60 bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink">Order Summary</h2>

              <div className="mt-5 space-y-3 border-b border-line pb-5 text-sm">
                <div className="flex justify-between text-ink-secondary">
                  <span>Subtotal</span>
                  <span>{formatUsd(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between font-medium text-success">
                    <span>
                      Discount {cart.discountCode ?? (cart.referralCode ? `(ref: ${cart.referralCode})` : '')}
                    </span>
                    <span>-{formatUsd(discount)}</span>
                  </div>
                )}
              </div>

              {/* Discount code */}
              <div className="mt-5">
                <label htmlFor="discount" className="text-sm font-medium text-ink">
                  Discount code
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="discount"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. WELCOME10"
                    className="flex-1 rounded-btn border border-line px-3.5 py-2.5 text-sm uppercase focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                  <Button variant="outline" size="md" onClick={applyCode}>
                    <Tag size={14} /> Apply
                  </Button>
                </div>
                {codeError && <p className="mt-1.5 text-xs text-danger">{codeError}</p>}
                {cart.referralCode && (
                  <p className="mt-1.5 text-xs text-success">
                    Referral code {cart.referralCode} applied automatically.
                  </p>
                )}
              </div>

              <div className="mt-6 space-y-1 border-t border-line pt-5">
                <div className="flex justify-between font-display text-xl font-bold text-ink">
                  <span>Total</span>
                  <span>{formatUsd(total)}</span>
                </div>
                <p className="text-right text-xs text-ink-muted">≈ {formatKhr(total)} KHR</p>
              </div>

              <Button href="/esim/checkout" size="lg" className="mt-6 w-full">
                Proceed to Checkout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
