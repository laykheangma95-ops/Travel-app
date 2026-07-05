'use client';

import { useState } from 'react';
import { Check, X, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface AdminAffiliate {
  id: string;
  name: string;
  telegram: string;
  code: string;
  clicks: number;
  orders: number;
  earned: number;
  unpaid: number;
  status: 'pending' | 'approved' | 'rejected';
}

// Demo rows — real data lives in the affiliates table.
const initialAffiliates: AdminAffiliate[] = [
  { id: '1', name: 'Sokha Prak', telegram: '@sokha', code: 'SOKHA30', clicks: 184, orders: 23, earned: 96.6, unpaid: 42.3, status: 'approved' },
  { id: '2', name: 'Dara Meas', telegram: '@daratravel', code: 'DARA30', clicks: 67, orders: 8, earned: 31.2, unpaid: 31.2, status: 'approved' },
  { id: '3', name: 'Bopha Chea', telegram: '@bophagoes', code: '—', clicks: 0, orders: 0, earned: 0, unpaid: 0, status: 'pending' },
  { id: '4', name: 'Rithy Long', telegram: '@rithyvlogs', code: '—', clicks: 0, orders: 0, earned: 0, unpaid: 0, status: 'pending' },
];

const statusTone = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState(initialAffiliates);

  const setStatus = (id: string, status: AdminAffiliate['status']) => {
    setAffiliates((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status, code: status === 'approved' && a.code === '—' ? `${a.name.split(' ')[0].toUpperCase()}30` : a.code }
          : a
      )
    );
  };

  const markPaid = (id: string) => {
    setAffiliates((prev) => prev.map((a) => (a.id === id ? { ...a, unpaid: 0 } : a)));
  };

  return (
    <Card className="overflow-x-auto p-6">
      <h2 className="mb-4 font-display font-bold text-ink">Affiliate applications & stats</h2>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <th className="pb-3 pr-4 font-medium">Affiliate</th>
            <th className="pb-3 pr-4 font-medium">Code</th>
            <th className="pb-3 pr-4 font-medium">Clicks</th>
            <th className="pb-3 pr-4 font-medium">Orders</th>
            <th className="pb-3 pr-4 font-medium">Earned</th>
            <th className="pb-3 pr-4 font-medium">Unpaid</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {affiliates.map((a) => (
            <tr key={a.id}>
              <td className="py-3.5 pr-4">
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-ink-muted">{a.telegram}</p>
              </td>
              <td className="py-3.5 pr-4 font-mono text-xs">{a.code}</td>
              <td className="py-3.5 pr-4">{a.clicks}</td>
              <td className="py-3.5 pr-4">{a.orders}</td>
              <td className="py-3.5 pr-4 font-semibold">${a.earned.toFixed(2)}</td>
              <td className="py-3.5 pr-4 font-semibold text-accent">${a.unpaid.toFixed(2)}</td>
              <td className="py-3.5 pr-4">
                <Badge tone={statusTone[a.status]}>{a.status}</Badge>
              </td>
              <td className="py-3.5">
                <div className="flex gap-1.5">
                  {a.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setStatus(a.id, 'approved')}
                        className="rounded-btn bg-success p-1.5 text-white transition-opacity hover:opacity-90"
                        aria-label={`Approve ${a.name}`}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus(a.id, 'rejected')}
                        className="rounded-btn bg-danger p-1.5 text-white transition-opacity hover:opacity-90"
                        aria-label={`Reject ${a.name}`}
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                  {a.status === 'approved' && a.unpaid > 0 && (
                    <button
                      type="button"
                      onClick={() => markPaid(a.id)}
                      className="inline-flex items-center gap-1 rounded-btn bg-secondary px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <DollarSign size={12} /> Mark paid
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
