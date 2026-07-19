'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreditCard, Landmark, Loader2, ShoppingCart } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, formatKhr, formatUsd } from '@/lib/utils';

const checkoutSchema = z.object({
  fullName: z.string().min(2, 'Please enter your full name'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(6, 'Please enter your phone number'),
  contactMethod: z.enum(['telegram', 'whatsapp', 'email']),
  deviceType: z.enum(['iphone', 'android', 'not-sure']),
  notes: z.string().optional(),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

type PayMethod = 'stripe' | 'aba';

export default function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('stripe');
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { contactMethod: 'telegram', deviceType: 'iphone' },
  });

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-busy="true" />;

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={ShoppingCart}
          title="Nothing to check out"
          description="Add an eSIM plan to your cart first."
          ctaLabel="Browse eSIM plans"
          ctaHref="/esim"
        />
      </div>
    );
  }

  const total = cart.total();

  const onSubmit = async (form: CheckoutForm) => {
    setProcessing(true);
    setPayError(null);
    try {
      const endpoint = payMethod === 'stripe' ? '/api/payments/stripe' : '/api/payments/aba';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: form,
          items: cart.items,
          totalUsd: total,
          referralCode: cart.referralCode,
          discountCode: cart.discountCode,
        }),
      });
      if (!res.ok) throw new Error('Payment could not be started. Please try again.');
      const data = (await res.json()) as { orderNumber: string; paymentUrl?: string };
      cart.clear();
      if (data.paymentUrl && !data.paymentUrl.startsWith('/order-confirmation')) {
        window.location.href = data.paymentUrl;
      } else {
        router.push(`/order-confirmation/${data.orderNumber}?method=${payMethod}`);
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Something went wrong');
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 font-display text-3xl font-bold text-ink">Checkout</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-5">
        {/* Customer form */}
        <div className="space-y-5 lg:col-span-3">
          <div className="rounded-card border border-line/60 bg-surface-1 p-7 shadow-card">
            <h2 className="mb-5 font-display text-lg font-bold text-ink">Your details</h2>
            <div className="space-y-4">
              <Input
                id="fullName"
                label="Full Name"
                required
                placeholder="e.g. Sokha Prak"
                error={errors.fullName?.message}
                {...register('fullName')}
              />
              <Input
                id="email"
                label="Email Address"
                type="email"
                required
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                id="phone"
                label="Phone Number (WhatsApp/Telegram)"
                required
                placeholder="+855 12 345 678"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <Select id="contactMethod" label="Preferred contact" {...register('contactMethod')}>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </Select>
              <Select id="deviceType" label="Device Type" {...register('deviceType')}>
                <option value="iphone">iPhone</option>
                <option value="android">Android</option>
                <option value="not-sure">Not sure</option>
              </Select>
              <Textarea
                id="notes"
                label="Special Notes (optional)"
                placeholder="Anything we should know?"
                {...register('notes')}
              />
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 space-y-5">
            <div className="rounded-card border border-line/60 bg-surface-1 p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-ink">Order summary</h2>
              <ul className="mt-4 space-y-2 border-b border-line pb-4 text-sm text-ink-secondary">
                {cart.items.map((i) => (
                  <li key={i.planId} className="flex justify-between">
                    <span>
                      {i.flag} {i.countryName} {i.planName}
                      {i.quantity > 1 && ` ×${i.quantity}`}
                    </span>
                    <span>{formatUsd(i.priceUsd * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-between font-display text-lg font-bold text-ink">
                <span>Total</span>
                <span>{formatUsd(total)}</span>
              </div>
              <p className="text-right text-xs text-ink-muted">≈ {formatKhr(total)} KHR</p>
            </div>

            <div className="rounded-card border border-line/60 bg-surface-1 p-6 shadow-card">
              <h2 className="mb-4 font-display text-lg font-bold text-ink">Payment method</h2>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setPayMethod('stripe')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-btn border-2 p-4 text-left transition-all duration-200 ease-smooth',
                    payMethod === 'stripe'
                      ? 'border-accent bg-[#F5EEDC]/60'
                      : 'border-line hover:border-ink-muted'
                  )}
                  aria-pressed={payMethod === 'stripe'}
                >
                  <CreditCard size={22} className="shrink-0 text-secondary" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">International Cards</p>
                    <p className="text-xs text-ink-muted">Visa · Mastercard · Amex — via Stripe</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPayMethod('aba')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-btn border-2 p-4 text-left transition-all duration-200 ease-smooth',
                    payMethod === 'aba'
                      ? 'border-accent bg-[#F5EEDC]/60'
                      : 'border-line hover:border-ink-muted'
                  )}
                  aria-pressed={payMethod === 'aba'}
                >
                  <Landmark size={22} className="shrink-0 text-secondary" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">ABA PayWay (Cambodia)</p>
                    <p className="text-xs text-ink-muted">KHQR · ABA Mobile · local cards</p>
                  </div>
                </button>
              </div>

              {payError && (
                <p className="mt-4 rounded-btn bg-danger/10 p-3 text-sm text-danger">{payError}</p>
              )}

              <button
                type="submit"
                disabled={processing}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-smooth hover:brightness-110 hover:shadow-md disabled:opacity-60"
              >
                {processing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Processing…
                  </>
                ) : payMethod === 'stripe' ? (
                  'Pay with Card'
                ) : (
                  'Pay with ABA / KHQR'
                )}
              </button>
              <p className="mt-3 text-center text-xs text-ink-muted">
                Secure payment · QR delivered within 15 minutes
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
