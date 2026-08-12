'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Package, TrendingUp, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OwnerBriefing } from '@/components/admin/OwnerBriefing';
import { useSession } from '@/hooks/useSession';
import { formatUsd } from '@/lib/utils';
import type { OrderStatus } from '@/types';

// Live figures from esim_orders. These tiles previously showed invented numbers
// ("Orders today: 14", "+18%") that never moved regardless of real trade.

interface OrderStats {
  total: number;
  byStatus: Record<OrderStatus, number>;
  revenueUsd: number;
  last7dRevenueUsd: number;
}

interface RecentOrder {
  id: string;
  order_number: string;
  country: string;
  plan_name: string;
  price_usd: number;
  status: OrderStatus;
  created_at: string;
}

const statusTone: Record<OrderStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
};

export default function AdminDashboardPage() {
  const { role } = useSession();
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/orders?limit=8', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        orders?: RecentOrder[];
        stats?: OrderStats;
        error?: { message?: string };
      } | null;

      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load dashboard data.');

      setStats(data?.stats ?? null);
      setRecent(data?.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const awaitingFulfilment = stats?.byStatus.paid ?? 0;

  const tiles = [
    {
      label: 'Awaiting fulfilment',
      value: String(awaitingFulfilment),
      icon: AlertTriangle,
      hint: awaitingFulfilment > 0 ? 'Customers are waiting for their eSIM' : 'All caught up',
      urgent: awaitingFulfilment > 0,
    },
    {
      label: 'Fulfilled orders',
      value: String(stats?.byStatus.fulfilled ?? 0),
      icon: Package,
      hint: 'Delivered to customers',
      urgent: false,
    },
    {
      label: 'Revenue (7 days)',
      value: formatUsd(stats?.last7dRevenueUsd ?? 0),
      icon: TrendingUp,
      hint: 'Paid and fulfilled orders',
      urgent: false,
    },
    {
      label: 'Revenue (all time)',
      value: formatUsd(stats?.revenueUsd ?? 0),
      icon: DollarSign,
      hint: 'Settled money only',
      urgent: false,
    },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Owner only. The tiles below repeat these figures for every role, so
          this is a summary and a set of shortcuts, not information anyone else
          is being denied. */}
      {role === 'admin' && (
        <OwnerBriefing
          awaitingFulfilment={awaitingFulfilment}
          pendingPayment={stats?.byStatus.pending ?? 0}
          loading={loading}
        />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {tile.label}
              </p>
              <tile.icon
                size={17}
                className={tile.urgent ? 'text-danger' : 'text-accent'}
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ink">
              {loading ? '—' : tile.value}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{tile.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-bold text-ink">Recent orders</h2>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:text-accent"
          >
            All orders <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">The eight most recent orders</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="pb-3 pr-4 font-medium">Order</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Country</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Plan</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Total</th>
                <th scope="col" className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((order) => (
                <tr key={order.id}>
                  <td className="py-3 pr-4 font-mono text-xs">{order.order_number}</td>
                  <td className="py-3 pr-4">{order.country}</td>
                  <td className="py-3 pr-4 text-ink-secondary">{order.plan_name}</td>
                  <td className="py-3 pr-4 font-semibold">{formatUsd(Number(order.price_usd))}</td>
                  <td className="py-3">
                    <Badge tone={statusTone[order.status]}>{order.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
          </p>
        )}
        {!loading && recent.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-ink-muted">
            No orders yet. They will appear here the moment a payment settles.
          </p>
        )}
      </Card>
    </div>
  );
}
