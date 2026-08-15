'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The receipt.
//
// The screen a customer lands on after paying, and the one place that has to be
// straight with them about what actually happened. The previous version was a
// static page: it congratulated anyone on any order number, including a
// cancelled ABA session or a declined card, and showed no status, no items and
// no total.
//
// It is also where the cart is emptied. Checkout used to clear it the moment
// the payment intent came back — several lines before the ABA form-post or the
// Stripe redirect — so anyone who abandoned at the gateway, or whose card was
// declined, came back to an empty cart and had to rebuild the order. The cart
// now survives until an order is confirmed paid, which is the only moment it
// is safe to throw away.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  MessageCircle,
  Plane,
  RotateCcw,
} from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { SignInLink } from '@/components/ui/SignInLink';
import { TelegramConnectCard } from '@/components/esim/TelegramConnectCard';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/lib/i18n';
import { formatUsd } from '@/lib/utils';

type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';

interface OrderLine {
  countryName: string;
  planName: string;
  quantity: number;
  durationDays: number;
}

interface OrderStatusPayload {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string | null;
  totalUsd: number;
  paymentMethod: 'stripe' | 'aba' | null;
  lines: OrderLine[];
}

type View =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'offline' }
  | { kind: 'ready'; order: OrderStatusPayload };

/** Everything the screen says about one status, in one place. */
function statusCopy(status: OrderStatus, lang: 'en' | 'km') {
  switch (status) {
    case 'fulfilled':
      return {
        tone: 'good' as const,
        title: lang === 'km' ? 'eSIM របស់អ្នករួចរាល់' : 'Your eSIM is ready',
        body:
          lang === 'km'
            ? 'យើងបានផ្ញើកូដ QR ទៅអ្នករួចហើយ។ ស្កេនវាដើម្បីដំឡើង។'
            : 'We have sent your QR code. Scan it to install, then turn the eSIM on when you land.',
      };
    case 'paid':
      return {
        tone: 'good' as const,
        title: lang === 'km' ? 'ការទូទាត់បានទទួល' : 'Payment received',
        body:
          lang === 'km'
            ? 'យើងកំពុងរៀបចំ eSIM របស់អ្នក។ កូដ QR នឹងមកដល់ក្នុងរយៈពេល ១៥ នាទី។'
            : 'We are preparing your eSIM now. Your QR code arrives within 15 minutes.',
      };
    case 'pending':
      return {
        tone: 'waiting' as const,
        title: lang === 'km' ? 'រង់ចាំការទូទាត់' : 'Waiting for payment',
        body:
          lang === 'km'
            ? 'យើងមិនទាន់ឃើញការទូទាត់សម្រាប់ការបញ្ជាទិញនេះទេ។ បើអ្នកបានបោះបង់នៅទំព័រទូទាត់ អ្នកអាចព្យាយាមម្ដងទៀត។'
            : "We have not seen a payment for this order yet. If you closed the payment page, you can try again — nothing has been charged.",
      };
    case 'cancelled':
      return {
        tone: 'bad' as const,
        title: lang === 'km' ? 'ការបញ្ជាទិញត្រូវបានបោះបង់' : 'This order was cancelled',
        body:
          lang === 'km'
            ? 'គ្មានការគិតលុយទេ។ អ្នកអាចបញ្ជាទិញម្តងទៀត ឬសរសេរមកយើង។'
            : 'Nothing was charged. You can order again, or message us if this looks wrong.',
      };
    case 'refunded':
      return {
        tone: 'bad' as const,
        title: lang === 'km' ? 'ការបញ្ជាទិញនេះត្រូវបានសងប្រាក់វិញ' : 'This order was refunded',
        body:
          lang === 'km'
            ? 'ប្រាក់ត្រូវបានសងទៅវិញ។ សូមទាក់ទងមកយើងបើមានសំណួរ។'
            : 'The money has been returned. Message us if you have any questions about it.',
      };
  }
}

export function OrderConfirmationView({ orderNumber }: { orderNumber: string }) {
  const { lang } = useLang();
  const { user } = useSession();
  const clearCart = useCart((state) => state.clear);
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/orders/${encodeURIComponent(orderNumber)}/status`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as OrderStatusPayload;
      })
      .then((order) => {
        if (cancelled) return;
        if (!order?.orderNumber) {
          setView({ kind: 'unknown' });
          return;
        }
        setView({ kind: 'ready', order });

        // Only once the money is actually in. A pending order means the
        // customer may still want to pay for exactly this basket.
        if (order.status === 'paid' || order.status === 'fulfilled') clearCart();
      })
      .catch(() => {
        // A lost connection is not a missing order, and must not be reported as
        // one on the screen that confirms someone's purchase.
        if (!cancelled) setView({ kind: 'offline' });
      });

    return () => {
      cancelled = true;
    };
  }, [orderNumber, clearCart]);

  if (view.kind === 'loading') {
    return (
      <Shell>
        <div className="space-y-4" aria-busy="true">
          <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
          <div className="mx-auto h-8 w-64 animate-pulse rounded-btn bg-white/[0.06] motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-card border border-white/8 bg-white/[0.03] motion-reduce:animate-none" />
        </div>
      </Shell>
    );
  }

  if (view.kind === 'offline' || view.kind === 'unknown') {
    const offline = view.kind === 'offline';
    return (
      <Shell>
        <div className="night-card p-8 text-center">
          <AlertCircle size={26} className="mx-auto text-gold-light" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl text-white">
            {offline
              ? lang === 'km'
                ? 'មិនអាចពិនិត្យការបញ្ជាទិញបានទេ'
                : "We couldn't check this order"
              : lang === 'km'
                ? 'រកមិនឃើញការបញ្ជាទិញនេះទេ'
                : 'We have no record of that order'}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {offline
              ? lang === 'km'
                ? 'សូមពិនិត្យការតភ្ជាប់របស់អ្នក ហើយផ្ទុកទំព័រនេះម្ដងទៀត។ ការបញ្ជាទិញរបស់អ្នកមិនបាត់ទេ។'
                : 'Check your connection and reload. Your order is not affected.'
              : lang === 'km'
                ? `យើងរកមិនឃើញការបញ្ជាទិញលេខ ${orderNumber} ទេ។ សូមពិនិត្យអ៊ីមែលបញ្ជាក់របស់អ្នក ឬសរសេរមកយើង។`
                : `Nothing here matches ${orderNumber}. Check your confirmation email, or message us and we will find it.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/esim"
              className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'មើលគម្រោង eSIM' : 'Browse eSIM plans'}
            </Link>
            <SupportLink />
          </div>
        </div>
      </Shell>
    );
  }

  const { order } = view;
  const copy = statusCopy(order.status, lang);
  const settled = order.status === 'paid' || order.status === 'fulfilled';

  return (
    <Shell>
      <div className="text-center">
        <span
          className={
            copy.tone === 'good'
              ? 'mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success'
              : copy.tone === 'waiting'
                ? 'mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-warning/15 text-warning'
                : 'mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-danger/15 text-danger'
          }
        >
          {copy.tone === 'good' ? (
            <Check size={40} strokeWidth={3} aria-hidden="true" />
          ) : copy.tone === 'waiting' ? (
            <Clock size={36} aria-hidden="true" />
          ) : (
            <AlertCircle size={36} aria-hidden="true" />
          )}
        </span>

        <h1 className="mt-6 font-display text-3xl text-white sm:text-4xl">{copy.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">{copy.body}</p>
        <p className="mt-4 font-mono text-sm text-white/55">
          {lang === 'km' ? 'លេខបញ្ជាទិញ' : 'Order'}{' '}
          <span className="font-bold text-gold-light">{order.orderNumber}</span>
        </p>
      </div>

      {/* What was actually bought, and for how much. */}
      <div className="night-card mt-8 p-6 text-left">
        <h2 className="font-display text-lg text-white">
          {lang === 'km' ? 'អ្វីដែលអ្នកបានបញ្ជាទិញ' : 'What you ordered'}
        </h2>
        <ul className="mt-4 space-y-2 border-b border-white/10 pb-4 text-sm text-white/70">
          {order.lines.map((line, index) => (
            <li key={`${line.planName}-${index}`} className="flex justify-between gap-4">
              <span>
                {line.countryName} — {line.planName}
                {line.durationDays > 0 && (
                  <span className="text-white/45">
                    {' '}
                    · {line.durationDays} {lang === 'km' ? 'ថ្ងៃ' : 'days'}
                  </span>
                )}
                {line.quantity > 1 && ` ×${line.quantity}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between font-display text-lg text-white">
          <span>{lang === 'km' ? 'សរុប' : 'Total'}</span>
          <span className="font-mono tabular-nums">{formatUsd(order.totalUsd)}</span>
        </div>
        {order.paymentMethod && (
          <p className="mt-1 text-right text-xs text-white/45">
            {order.paymentMethod === 'aba' ? 'ABA PayWay' : lang === 'km' ? 'កាតឥណទាន' : 'Card'}
          </p>
        )}
      </div>

      {order.status === 'pending' && (
        <Link
          href="/esim/checkout"
          className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          <RotateCcw size={16} aria-hidden="true" />
          {lang === 'km' ? 'ព្យាយាមទូទាត់ម្ដងទៀត' : 'Try the payment again'}
        </Link>
      )}

      {/* Telegram delivery is a locked component and stays exactly as it was.
          It only has anything to offer once the order is paid. */}
      {settled && <TelegramConnectCard orderNumber={order.orderNumber} />}

      {settled && (
        <>
          {/* The moment of highest intent: money spent, destination known.
              "Add to your Trip" used to point at /checklist, a browser-local
              questionnaire that saves nothing and is attached to no trip. */}
          <div className="night-card mt-4 p-6 text-left">
            <h2 className="font-display text-lg text-white">
              {lang === 'km' ? 'បន្ទាប់មកទៀត' : 'Next'}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'បង្កើតដំណើរសម្រាប់ការធ្វើដំណើរនេះ ហើយ eSIM របស់អ្នកនឹងបង្ហាញនៅទីនោះជាមួយជើងហោះហើរ និងកម្មវិធីដំណើររបស់អ្នក។'
                : 'Start a trip for this journey and your eSIM shows up on it, alongside your flight and your days.'}
            </p>
            <Link
              href={`/trips/new?destination=${encodeURIComponent(order.lines[0]?.countryName ?? '')}`}
              className="mt-4 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-gold-light/40 px-4 text-sm font-semibold text-gold-bright transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              {lang === 'km' ? 'បង្កើតដំណើរ' : 'Start a trip'}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          {/* A guest has no way to see this order again once they close the tab:
              /api/orders requires an account. Say so, here, while the order
              number is still on screen. */}
          {!user && (
            <div className="night-card mt-4 p-6 text-left">
              <h2 className="font-display text-lg text-white">
                {lang === 'km' ? 'រក្សាទុកការបញ្ជាទិញនេះ' : 'Keep this order'}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/65">
                {lang === 'km'
                  ? 'បង្កើតគណនីដោយប្រើអ៊ីមែលដដែលដែលអ្នកបានប្រើពេលទូទាត់ ហើយការបញ្ជាទិញនេះនឹងបង្ហាញក្នុង “eSIM របស់ខ្ញុំ”។'
                  : 'Create an account with the same email you used at checkout and this order appears under My eSIMs — with your QR whenever you need it again.'}
              </p>
              <SignInLink
                signUp
                returnTo="/my-esims"
                className="mt-4 inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              >
                {lang === 'km' ? 'បង្កើតគណនី' : 'Create an account'}
              </SignInLink>
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link
          href="/flights"
          className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <Plane size={15} aria-hidden="true" />
          {lang === 'km' ? 'តាមដានជើងហោះហើរ' : 'Track a flight'}
        </Link>
        <SupportLink />
      </div>
    </Shell>
  );
}

function SupportLink() {
  const { lang } = useLang();
  return (
    <a
      href="https://t.me/domnerapp"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
    >
      <MessageCircle size={15} aria-hidden="true" />
      {lang === 'km' ? 'ទាក់ទងជំនួយ' : 'Contact support'}
    </a>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // The funnel keeps its night canvas here. This screen used to drop into a
    // flat white page halfway through the purchase.
    <div className="night-canvas relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl px-4 py-14 sm:px-6">{children}</div>
    </div>
  );
}
