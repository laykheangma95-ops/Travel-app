'use client';

import { useCallback, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Headphones,
  Loader2,
  Search,
  Smartphone,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn, formatUsd } from '@/lib/utils';
import type { OrderStatus } from '@/types';

// Call-centre console. One search box, exact match only — a partial string
// returns nothing on purpose, so this screen cannot be used to page through the
// customer list. See lib/support.ts.

interface DeliveryAttempt {
  channel: string;
  succeeded: boolean;
  error: string | null;
  createdAt: string;
}

interface TimelineEntry {
  eventType: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actor: string | null;
  createdAt: string;
}

interface SupportOrder {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  planSummary: string;
  country: string;
  durationDays: number;
  items: Array<{ planName: string; countryName: string; quantity: number }>;
  totalUsd: number;
  currency: string;
  paymentMethod: string | null;
  customerName: string | null;
  customerEmailMasked: string | null;
  customerPhoneMasked: string | null;
  esimIssued: boolean;
  iccidLast4: string | null;
  hasQrCode: boolean;
  providerName: string | null;
  providerOrderId: string | null;
  deliveryChannel: string | null;
  deliveredEmailAt: string | null;
  deliveredTelegramAt: string | null;
  deliveryAttempts: DeliveryAttempt[];
  timeline: TimelineEntry[];
  diagnosis: string;
  nextAction: string;
}

const statusTone: Record<OrderStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
};

/** Paid but not fulfilled is the state that costs money if nobody notices. */
function isUrgent(order: SupportOrder): boolean {
  return order.status === 'paid' && !order.esimIssued;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export default function AdminSupportPage() {
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<SupportOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const term = query.trim();
      if (!term) return;

      setLoading(true);
      setError(null);
      setOrders(null);

      try {
        const res = await fetch(`/api/admin/support?q=${encodeURIComponent(term)}`, {
          credentials: 'include',
        });
        const payload = (await res.json()) as {
          orders?: SupportOrder[];
          error?: { message?: string };
        };

        if (!res.ok) {
          throw new Error(payload.error?.message ?? 'That lookup failed.');
        }

        setOrders(payload.orders ?? []);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'That lookup failed.');
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Headphones className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold text-ink">Customer lookup</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Enter the full order number, email address, or phone number the customer gives you.
            </p>
          </div>
        </div>

        <form onSubmit={search} className="mt-4 flex flex-wrap gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="DN-2026-0001  ·  name@email.com  ·  +85512345678"
            className="min-w-[18rem] flex-1"
            aria-label="Order number, email address, or phone number"
            autoFocus
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                Looking up…
              </>
            ) : (
              <>
                <Search size={16} aria-hidden="true" />
                Find
              </>
            )}
          </Button>
        </form>

        <p className="mt-2 text-xs text-ink-secondary">
          Exact match only — partial searches return nothing, so this screen cannot list customers.
        </p>
      </Card>

      {error && (
        <div role="alert" className="rounded-btn border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {orders?.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-ink-secondary">
            No order matches that exactly. Check for a typo, and confirm whether they used a
            different email address at checkout.
          </p>
        </Card>
      )}

      {orders?.map((order) => (
        <Card key={order.orderNumber} className="overflow-hidden">
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4',
              isUrgent(order) ? 'border-amber-200 bg-amber-50' : 'border-line bg-surface-2'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</span>
              <Badge tone={statusTone[order.status]}>{order.status}</Badge>
              {isUrgent(order) && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <AlertTriangle size={14} aria-hidden="true" />
                  Paid, no eSIM
                </span>
              )}
            </div>
            <span className="text-sm font-semibold text-ink">{formatUsd(order.totalUsd)}</span>
          </div>

          {/* What to tell the customer — first thing on screen, deliberately. */}
          <div className="border-b border-line px-6 py-4">
            <p className="text-sm font-medium text-ink">{order.diagnosis}</p>
            <p className="mt-1 text-sm text-ink-secondary">{order.nextAction}</p>
          </div>

          <div className="grid gap-6 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <dl className="space-y-3">
              <Field label="Customer" value={order.customerName ?? '—'} />
              <Field label="Email" value={order.customerEmailMasked ?? '—'} />
              <Field label="Phone" value={order.customerPhoneMasked ?? '—'} />
            </dl>

            <dl className="space-y-3">
              <Field label="Plan" value={order.planSummary} />
              <Field label="Destination" value={order.country} />
              <Field label="Duration" value={`${order.durationDays} days`} />
              <Field label="Paid via" value={order.paymentMethod ?? '—'} />
            </dl>

            <dl className="space-y-3">
              <Field label="Ordered" value={formatWhen(order.createdAt)} />
              <Field label="Paid" value={formatWhen(order.paidAt)} />
              <Field label="Fulfilled" value={formatWhen(order.fulfilledAt)} />
            </dl>
          </div>

          <div className="border-t border-line px-6 py-5">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              <Smartphone size={14} aria-hidden="true" />
              eSIM
            </h4>
            {order.esimIssued ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="ICCID" value={order.iccidLast4 ? `•••• ${order.iccidLast4}` : '—'} />
                <Field label="QR code" value={order.hasQrCode ? 'Issued' : 'Not issued'} />
                <Field label="Supplier" value={order.providerName ?? '—'} />
                <Field label="Supplier ref" value={order.providerOrderId ?? '—'} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-ink-secondary">No eSIM has been issued yet.</p>
            )}
            <p className="mt-3 text-xs text-ink-secondary">
              Activation codes are never shown here. Re-send the QR from Orders instead.
            </p>
          </div>

          <div className="border-t border-line px-6 py-5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Delivery
            </h4>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Chose" value={order.deliveryChannel ?? 'email'} />
              <Field label="Email sent" value={formatWhen(order.deliveredEmailAt)} />
              <Field label="Telegram sent" value={formatWhen(order.deliveredTelegramAt)} />
            </dl>
            {order.deliveryAttempts.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {order.deliveryAttempts.map((attempt, index) => (
                  <li key={index} className="flex items-center gap-2 text-xs">
                    {attempt.succeeded ? (
                      <CheckCircle2 size={13} className="text-emerald-600" aria-hidden="true" />
                    ) : (
                      <AlertTriangle size={13} className="text-red-600" aria-hidden="true" />
                    )}
                    <span className="text-ink-secondary">
                      {formatWhen(attempt.createdAt)} · {attempt.channel}
                      {attempt.error ? ` — ${attempt.error}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {order.timeline.length > 0 && (
            <div className="border-t border-line bg-surface-2 px-6 py-5">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <Clock size={14} aria-hidden="true" />
                History
              </h4>
              <ul className="mt-3 space-y-1.5">
                {order.timeline.map((entry, index) => (
                  <li key={index} className="text-xs text-ink-secondary">
                    <span className="font-mono">{formatWhen(entry.createdAt)}</span> ·{' '}
                    <span className="font-medium text-ink">{entry.eventType}</span>
                    {entry.fromStatus && entry.toStatus
                      ? ` (${entry.fromStatus} → ${entry.toStatus})`
                      : ''}
                    {entry.actor ? ` · ${entry.actor}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
