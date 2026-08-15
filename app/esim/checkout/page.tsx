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
import { PhoneField } from '@/components/auth/PhoneField';
import { DeliveryOptions } from '@/components/esim/DeliveryOptions';
import { toE164, validatePhone } from '@/lib/phone';
import { cn, formatKhr, formatUsd } from '@/lib/utils';

const checkoutSchema = z
  .object({
    fullName: z.string().min(2, 'Please enter your full name'),
    email: z.string().email('Please enter a valid email address'),
    phoneCountry: z.string().min(2),
    phone: z.string(),
    deliveryChannel: z.enum(['email', 'telegram', 'both']),
    deviceType: z.enum(['iphone', 'android', 'not-sure']),
    notes: z.string().optional(),
  })
  // A number is only required when the customer asked for Telegram delivery —
  // an email-only buyer should never be blocked on a field they do not need.
  .superRefine((data, ctx) => {
    if (data.deliveryChannel === 'email' && !data.phone.trim()) return;
    const invalid = validatePhone(data.phoneCountry, data.phone);
    if (invalid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: invalid });
    }
  });

type CheckoutForm = z.infer<typeof checkoutSchema>;

type PayMethod = 'stripe' | 'aba';

/** Submits the signed ABA PayWay field set as a real form POST. */
function postToGateway(url: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.style.display = 'none';

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export default function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('stripe');
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // Generated once per visit to the checkout, not per submit, so a retry after
  // a network blip resolves to the same order instead of creating a second one.
  const [idempotencyKey] = useState(() =>
    globalThis.crypto?.randomUUID?.() ?? `ck-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      deliveryChannel: 'both',
      deviceType: 'iphone',
      phoneCountry: 'KH',
      phone: '',
    },
  });

  const deliveryChannel = watch('deliveryChannel');
  const phoneCountry = watch('phoneCountry');
  const phone = watch('phone');

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="night-canvas min-h-screen" aria-busy="true" />;

  if (cart.items.length === 0) {
    return (
      <div className="night-canvas min-h-screen">
        <div className="night-stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <EmptyState
            icon={ShoppingCart}
            title="Nothing to check out"
            description="Add an eSIM plan to your cart first."
            ctaLabel="Browse eSIM plans"
            ctaHref="/esim"
            dark
          />
        </div>
      </div>
    );
  }

  // Displayed to the customer only. The server re-derives every figure from the
  // catalog and charges its own number — see lib/pricing.ts.
  const total = cart.total();

  const onSubmit = async (form: CheckoutForm) => {
    setProcessing(true);
    setPayError(null);
    try {
      // One route serves every gateway; the segment IS the provider id, so
      // adding a payment method never touches this file.
      const res = await fetch(`/api/payments/${payMethod}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            ...form,
            // Send the number in E.164 so the server never has to guess a
            // country from a locally-formatted string.
            phone: form.phone.trim() ? toE164(form.phoneCountry, form.phone) : '',
          },
          // Intent only: which plan and how many. No prices are sent — a total
          // from the browser cannot influence what the customer is charged.
          items: cart.items.map((i) => ({ planId: i.planId, quantity: i.quantity })),
          referralCode: cart.referralCode,
          discountCode: cart.discountCode,
          // Stable for this checkout attempt so a double-tap cannot create two
          // orders or two charges.
          idempotencyKey,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            orderNumber?: string;
            /** 'client-secret' | 'redirect' | 'form-post' — set by the gateway adapter. */
            kind?: string;
            clientSecret?: string | null;
            paymentUrl?: string;
            fields?: Record<string, string>;
            totalUsd?: number;
            telegramConnectUrl?: string | null;
            error?: { message?: string };
          }
        | null;

      if (!res.ok || !data?.orderNumber) {
        throw new Error(
          data?.error?.message ?? 'Payment could not be started. Please try again.'
        );
      }

      // The cart is NOT cleared here.
      //
      // It used to be, on this line — several lines before the ABA form-post
      // and the Stripe redirect below. Anyone who abandoned at the gateway,
      // whose card was declined, or who simply pressed back came home to an
      // empty cart and had to rebuild the whole order. Creating a payment
      // intent is not the same event as being paid.
      //
      // Every route out of here — in-page, redirect and form-post alike — ends
      // at /order-confirmation/<orderNumber>, which reads the real status and
      // clears the cart once, and only once, the order is actually paid.

      // Hand the deep link to the confirmation page. Kept in sessionStorage
      // rather than the URL so the one-time token never lands in browser
      // history, a referrer header, or an analytics log.
      if (data.telegramConnectUrl) {
        sessionStorage.setItem(`domner-tg-${data.orderNumber}`, data.telegramConnectUrl);
      }

      // Continue however this particular gateway needs to. Handling all three
      // shapes here means a new payment method is a server-side change only.
      if (data.kind === 'form-post' && data.paymentUrl && data.fields) {
        // ABA PayWay expects a signed form POST, not a redirect with query params.
        postToGateway(data.paymentUrl, data.fields);
        return;
      }

      if (data.kind === 'redirect' && data.paymentUrl && /^https?:\/\//.test(data.paymentUrl)) {
        window.location.href = data.paymentUrl;
        return;
      }

      router.push(`/order-confirmation/${data.orderNumber}?method=${payMethod}`);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Something went wrong');
      setProcessing(false);
    }
  };

  return (
    // Night-sky funnel — the checkout keeps the home's cinematic surface instead
    // of dropping into a flat white form (see .claude/skills/ui-ux §9).
    <div className="night-canvas min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Almost there</p>
        <h1 className="mb-8 font-display text-3xl font-bold text-white">Checkout</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-5">
          {/* Customer form */}
          <div className="space-y-5 lg:col-span-3">
            <div className="night-card p-7">
              <h2 className="mb-5 font-display text-lg font-bold text-white">Your details</h2>
              <div className="space-y-4">
                <Input
                  id="fullName"
                  label="Full Name"
                  required
                  dark
                  placeholder="e.g. Sokha Prak"
                  error={errors.fullName?.message}
                  {...register('fullName')}
                />
                <Input
                  id="email"
                  label="Email Address"
                  type="email"
                  required
                  dark
                  placeholder="you@example.com"
                  error={errors.email?.message}
                  {...register('email')}
                />
                {/* PhoneField and CountryPicker are locked and ship light-surface
                    classes; .night-locked-surface repaints them for the night
                    canvas from globals.css without touching the locked files. */}
                <div className="night-locked-surface">
                  <PhoneField
                    label={
                      deliveryChannel === 'email' ? 'Phone number (optional)' : 'Phone number'
                    }
                    required={deliveryChannel !== 'email'}
                    country={phoneCountry}
                    onCountryChange={(code) => setValue('phoneCountry', code)}
                    number={phone}
                    onNumberChange={(value) => setValue('phone', value, { shouldValidate: true })}
                    error={errors.phone?.message}
                    hint={
                      deliveryChannel === 'email'
                        ? 'Only used if we need to reach you about this order.'
                        : 'Used to confirm your Telegram chat belongs to you.'
                    }
                  />
                </div>
                <Select id="deviceType" label="Device Type" dark {...register('deviceType')}>
                  <option value="iphone">iPhone</option>
                  <option value="android">Android</option>
                  <option value="not-sure">Not sure</option>
                </Select>
                <Textarea
                  id="notes"
                  label="Special Notes (optional)"
                  dark
                  placeholder="Anything we should know?"
                  {...register('notes')}
                />
              </div>
            </div>

            <div className="night-card night-locked-surface p-7">
              <h2 className="mb-5 font-display text-lg font-bold text-white">QR code delivery</h2>
              <DeliveryOptions
                value={deliveryChannel}
                onChange={(value) => setValue('deliveryChannel', value, { shouldValidate: true })}
              />
            </div>
          </div>

          {/* Payment */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 space-y-5">
              <div className="night-card p-6">
                <h2 className="font-display text-lg font-bold text-white">Order summary</h2>
                <ul className="mt-4 space-y-2 border-b border-white/10 pb-4 text-sm text-white/70">
                  {cart.items.map((i) => (
                    <li key={i.planId} className="flex justify-between">
                      <span>
                        {i.flag} {i.countryName} {i.planName}
                        {i.quantity > 1 && ` ×${i.quantity}`}
                      </span>
                      <span className="font-mono">{formatUsd(i.priceUsd * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex justify-between font-display text-lg font-bold text-white">
                  <span>Total</span>
                  <span className="font-mono">{formatUsd(total)}</span>
                </div>
                <p className="text-right text-xs text-white/50">≈ {formatKhr(total)} KHR</p>
              </div>

              <div className="night-card p-6">
                <h2 className="mb-4 font-display text-lg font-bold text-white">Payment method</h2>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setPayMethod('stripe')}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-btn border p-4 text-left transition-all duration-200 ease-smooth',
                      payMethod === 'stripe'
                        ? 'border-gold-light/60 bg-gold-light/10'
                        : 'border-white/10 bg-white/5 hover:border-gold-light/30'
                    )}
                    aria-pressed={payMethod === 'stripe'}
                  >
                    <CreditCard size={22} className="shrink-0 text-gold-light" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">International Cards</p>
                      <p className="text-xs text-white/55">Visa · Mastercard · Amex — via Stripe</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMethod('aba')}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-btn border p-4 text-left transition-all duration-200 ease-smooth',
                      payMethod === 'aba'
                        ? 'border-gold-light/60 bg-gold-light/10'
                        : 'border-white/10 bg-white/5 hover:border-gold-light/30'
                    )}
                    aria-pressed={payMethod === 'aba'}
                  >
                    <Landmark size={22} className="shrink-0 text-gold-light" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">ABA PayWay (Cambodia)</p>
                      <p className="text-xs text-white/55">KHQR · ABA Mobile · local cards</p>
                    </div>
                  </button>
                </div>

                {payError && (
                  <p className="mt-4 rounded-btn border border-danger/30 bg-danger/10 p-3 text-sm text-red-200" role="alert">
                    {payError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={processing}
                  className="liquid-glass-accent liquid-sheen liquid-touch liquid-press mt-5 inline-flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-btn px-5 py-3.5 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep disabled:opacity-60"
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
                <p className="mt-3 text-center text-xs text-white/50">
                  Secure payment · QR delivered within 15 minutes
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
