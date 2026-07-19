'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types';

interface AdminOrder {
  number: string;
  customer: string;
  email: string;
  country: string;
  plan: string;
  total: number;
  method: string;
  status: OrderStatus;
  created: string;
}

// Demo orders — real rows come from esim_orders once Supabase is connected.
const initialOrders: AdminOrder[] = [
  { number: 'DN-2026-4821', customer: 'Sokha Prak', email: 'sokha@example.com', country: 'Thailand 🇹🇭', plan: 'Standard 7d', total: 9.99, method: 'ABA', status: 'paid', created: 'Today 14:02' },
  { number: 'DN-2026-4820', customer: 'Dara Meas', email: 'dara@example.com', country: 'Vietnam 🇻🇳', plan: 'Basic 3d', total: 3.99, method: 'Stripe', status: 'fulfilled', created: 'Today 11:47' },
  { number: 'DN-2026-4819', customer: 'Channary Sok', email: 'channary@example.com', country: 'Japan 🇯🇵', plan: 'Premium 15d', total: 25.99, method: 'ABA', status: 'pending', created: 'Today 09:15' },
  { number: 'DN-2026-4818', customer: 'Vibol Chan', email: 'vibol@example.com', country: 'Singapore 🇸🇬', plan: 'Standard 7d', total: 10.99, method: 'Stripe', status: 'fulfilled', created: 'Yesterday 22:31' },
  { number: 'DN-2026-4817', customer: 'Sreymom Kim', email: 'sreymom@example.com', country: 'China 🇨🇳', plan: 'Premium 15d', total: 21.99, method: 'ABA', status: 'paid', created: 'Yesterday 18:04' },
];

const FILTERS: Array<'all' | OrderStatus> = ['all', 'pending', 'paid', 'fulfilled', 'cancelled'];
const statusTone: Record<OrderStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  const markFulfilled = (number: string) => {
    setOrders((prev) => prev.map((o) => (o.number === number ? { ...o, status: 'fulfilled' } : o)));
  };

  return (
    <div className="space-y-6">
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
                : 'border border-line bg-surface-1 text-ink-secondary hover:border-secondary'
            )}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto p-6">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <th className="pb-3 pr-4 font-medium">Order</th>
              <th className="pb-3 pr-4 font-medium">Customer</th>
              <th className="pb-3 pr-4 font-medium">Country / Plan</th>
              <th className="pb-3 pr-4 font-medium">Total</th>
              <th className="pb-3 pr-4 font-medium">Payment</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((o) => (
              <tr key={o.number}>
                <td className="py-3.5 pr-4">
                  <p className="font-mono text-xs font-semibold">{o.number}</p>
                  <p className="text-xs text-ink-muted">{o.created}</p>
                </td>
                <td className="py-3.5 pr-4">
                  <p className="font-medium">{o.customer}</p>
                  <p className="text-xs text-ink-muted">{o.email}</p>
                </td>
                <td className="py-3.5 pr-4">
                  {o.country} · {o.plan}
                </td>
                <td className="py-3.5 pr-4 font-semibold">${o.total.toFixed(2)}</td>
                <td className="py-3.5 pr-4">{o.method}</td>
                <td className="py-3.5 pr-4">
                  <Badge tone={statusTone[o.status]}>{o.status}</Badge>
                </td>
                <td className="py-3.5">
                  {o.status !== 'fulfilled' && o.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => markFulfilled(o.number)}
                      className="inline-flex items-center gap-1.5 rounded-btn bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <CheckCircle2 size={13} /> Mark fulfilled
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-muted">No {filter} orders.</p>
        )}
      </Card>
    </div>
  );
}
