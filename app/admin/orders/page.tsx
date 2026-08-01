'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn, formatUsd } from '@/lib/utils';
import type { OrderStatus } from '@/types';

// Live rows from esim_orders via /api/admin/orders. This page used to render a
// hardcoded array of fictional customers, and "Mark fulfilled" only changed
// local React state — nothing ever reached the database.

interface AdminOrderItem {
  plan_id: string;
  country_name: string;
  plan_name: string;
  quantity: number;
  unit_price_usd: number;
  line_total_usd: number;
}

interface AdminOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  device_type: string | null;
  country: string;
  plan_name: string;
  price_usd: number;
  discount_usd: number;
  status: OrderStatus;
  payment_method: string | null;
  qr_code_url: string | null;
  created_at: string;
  paid_at: string | null;
  items?: AdminOrderItem[];
}

interface OrderStats {
  total: number;
  byStatus: Record<OrderStatus, number>;
  revenueUsd: number;
  last7dRevenueUsd: number;
}

const FILTERS: Array<'all' | OrderStatus> = ['all', 'pending', 'paid', 'fulfilled', 'cancelled', 'refunded'];

const statusTone: Record<OrderStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState<AdminOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/orders?${params}`, { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        orders?: AdminOrder[];
        stats?: OrderStats | null;
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Could not load orders.');
      }

      setOrders(data?.orders ?? []);
      if (data?.stats) setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a query per keystroke.
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const tiles = useMemo(
    () =>
      stats
        ? [
            { label: 'Awaiting fulfilment', value: String(stats.byStatus.paid ?? 0), tone: 'accent' },
            { label: 'Fulfilled', value: String(stats.byStatus.fulfilled ?? 0), tone: 'ink' },
            { label: 'Revenue (7d)', value: formatUsd(stats.last7dRevenueUsd), tone: 'ink' },
            { label: 'Revenue (all)', value: formatUsd(stats.revenueUsd), tone: 'ink' },
          ]
        : [],
    [stats]
  );

  return (
    <div className="space-y-6">
      {tiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label} className="p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">{tile.label}</p>
              <p
                className={cn(
                  'mt-1.5 font-display text-2xl font-bold',
                  tile.tone === 'accent' ? 'text-accent' : 'text-ink'
                )}
              >
                {tile.value}
              </p>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium capitalize transition-all duration-200',
                filter === f
                  ? 'bg-secondary text-white shadow-sm'
                  : 'border border-line bg-white text-ink-secondary hover:border-secondary'
              )}
              aria-pressed={filter === f}
            >
              {f}
              {stats && f !== 'all' ? ` (${stats.byStatus[f] ?? 0})` : ''}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order, name or email"
              aria-label="Search orders"
              className="w-56 rounded-btn border border-line py-2 pl-9 pr-3 text-sm focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm text-ink-secondary transition-colors hover:border-secondary hover:text-secondary"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      <Card className="overflow-x-auto p-6">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">eSIM orders</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <th scope="col" className="pb-3 pr-4 font-medium">Order</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Customer</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Country / Plan</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Total</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Payment</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Status</th>
              <th scope="col" className="pb-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="py-3.5 pr-4">
                  <p className="font-mono text-xs font-semibold">{order.order_number}</p>
                  <p className="text-xs text-ink-muted">{formatWhen(order.created_at)}</p>
                </td>
                <td className="py-3.5 pr-4">
                  <p className="font-medium">{order.customer_name ?? '—'}</p>
                  <p className="text-xs text-ink-muted">{order.customer_email ?? '—'}</p>
                </td>
                <td className="py-3.5 pr-4">
                  <p>{order.country}</p>
                  <p className="text-xs text-ink-muted">{order.plan_name}</p>
                </td>
                <td className="py-3.5 pr-4 font-semibold">{formatUsd(Number(order.price_usd))}</td>
                <td className="py-3.5 pr-4 capitalize">{order.payment_method ?? '—'}</td>
                <td className="py-3.5 pr-4">
                  <Badge tone={statusTone[order.status]}>{order.status}</Badge>
                </td>
                <td className="py-3.5">
                  {order.status === 'paid' && (
                    <button
                      type="button"
                      onClick={() => setFulfilling(order)}
                      className="inline-flex items-center gap-1.5 rounded-btn bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <CheckCircle2 size={13} aria-hidden="true" /> Deliver eSIM
                    </button>
                  )}
                  {order.status === 'fulfilled' && order.qr_code_url && (
                    <a
                      href={order.qr_code_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-secondary underline"
                    >
                      View QR
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && orders.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading orders…
          </p>
        )}
        {!loading && orders.length === 0 && !error && (
          <p className="py-10 text-center text-sm text-ink-muted">
            No {filter === 'all' ? '' : `${filter} `}orders yet.
          </p>
        )}
      </Card>

      {fulfilling && (
        <FulfilDialog
          order={fulfilling}
          onClose={() => setFulfilling(null)}
          onDone={() => {
            setFulfilling(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Attaches the eSIM to a paid order and emails the customer their QR code. */
function FulfilDialog({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [iccid, setIccid] = useState('');
  const [providerName, setProviderName] = useState('');
  const [providerOrderId, setProviderOrderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.order_number,
          status: 'fulfilled',
          qrCodeUrl: qrCodeUrl.trim() || undefined,
          activationCode: activationCode.trim() || undefined,
          iccid: iccid.trim() || undefined,
          providerName: providerName.trim() || undefined,
          providerOrderId: providerOrderId.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not fulfil this order.');

      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fulfil this order.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fulfil-title"
    >
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="fulfil-title" className="font-display text-lg font-bold text-ink">
              Deliver eSIM
            </h2>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{order.order_number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-surface-3"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 rounded-btn bg-surface-3 p-3 text-xs text-ink-secondary">
          {order.country} · {order.plan_name} · {formatUsd(Number(order.price_usd))}
          <br />
          {order.customer_email}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <Input
            id="qrCodeUrl"
            label="QR code URL"
            type="url"
            placeholder="https://…/esim-qr.png"
            value={qrCodeUrl}
            onChange={(e) => setQrCodeUrl(e.target.value)}
          />
          <Input
            id="activationCode"
            label="Activation code (LPA)"
            placeholder="LPA:1$rsp.example.com$ABC123"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
          />
          <Input
            id="iccid"
            label="ICCID (optional)"
            value={iccid}
            onChange={(e) => setIccid(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="providerName"
              label="Supplier"
              placeholder="Airalo"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
            <Input
              id="providerOrderId"
              label="Supplier ref"
              value={providerOrderId}
              onChange={(e) => setProviderOrderId(e.target.value)}
            />
          </div>

          <p className="text-xs text-ink-muted">
            Provide a QR code URL or an activation code — the customer is emailed whichever you
            supply.
          </p>

          {error && (
            <p role="alert" className="rounded-btn bg-red-50 p-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Deliver &amp; email customer
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
