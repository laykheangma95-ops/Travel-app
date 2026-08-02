'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatUsd } from '@/lib/utils';

// Live rows from the affiliates table. The approve/reject buttons previously
// only mutated local React state, so an "approved" affiliate was never actually
// activated and their referral code never worked.

type AffiliateStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface Affiliate {
  id: string;
  name: string;
  email: string;
  telegram: string | null;
  referral_code: string;
  commission_rate: number;
  total_clicks: number;
  total_orders: number;
  total_earned_usd: number;
  status: AffiliateStatus;
  created_at: string;
}

const statusTone = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  suspended: 'neutral',
} as const;

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/affiliates', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        affiliates?: Affiliate[];
        error?: { message?: string };
      } | null;

      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load affiliates.');
      setAffiliates(data?.affiliates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load affiliates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, status: AffiliateStatus) => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });

      const data = (await res.json().catch(() => null)) as {
        affiliate?: Affiliate;
        error?: { message?: string };
      } | null;

      if (!res.ok || !data?.affiliate) {
        throw new Error(data?.error?.message ?? 'Could not update this affiliate.');
      }

      // Reconcile with the row the server actually persisted.
      setAffiliates((prev) => prev.map((a) => (a.id === id ? data.affiliate! : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this affiliate.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="overflow-x-auto p-6">
      <h2 className="mb-4 font-display font-bold text-ink">Affiliate applications &amp; stats</h2>

      {error && (
        <div role="alert" className="mb-4 rounded-btn bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <table className="w-full min-w-[820px] text-left text-sm">
        <caption className="sr-only">Affiliate partners</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="pb-3 pr-4 font-medium">Affiliate</th>
            <th scope="col" className="pb-3 pr-4 font-medium">Code</th>
            <th scope="col" className="pb-3 pr-4 font-medium">Rate</th>
            <th scope="col" className="pb-3 pr-4 font-medium">Clicks</th>
            <th scope="col" className="pb-3 pr-4 font-medium">Orders</th>
            <th scope="col" className="pb-3 pr-4 font-medium">Earned</th>
            <th scope="col" className="pb-3 pr-4 font-medium">Status</th>
            <th scope="col" className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {affiliates.map((affiliate) => (
            <tr key={affiliate.id}>
              <td className="py-3.5 pr-4">
                <p className="font-medium">{affiliate.name}</p>
                <p className="text-xs text-ink-muted">
                  {affiliate.telegram ?? affiliate.email}
                </p>
              </td>
              <td className="py-3.5 pr-4 font-mono text-xs">{affiliate.referral_code}</td>
              <td className="py-3.5 pr-4">{Math.round(Number(affiliate.commission_rate) * 100)}%</td>
              <td className="py-3.5 pr-4">{affiliate.total_clicks}</td>
              <td className="py-3.5 pr-4">{affiliate.total_orders}</td>
              <td className="py-3.5 pr-4 font-semibold">
                {formatUsd(Number(affiliate.total_earned_usd))}
              </td>
              <td className="py-3.5 pr-4">
                <Badge tone={statusTone[affiliate.status]}>{affiliate.status}</Badge>
              </td>
              <td className="py-3.5">
                <div className="flex gap-1.5">
                  {savingId === affiliate.id ? (
                    <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden="true" />
                  ) : (
                    <>
                      {affiliate.status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => decide(affiliate.id, 'approved')}
                          className="rounded-btn bg-success p-1.5 text-white transition-opacity hover:opacity-90"
                          aria-label={`Approve ${affiliate.name}`}
                        >
                          <Check size={14} aria-hidden="true" />
                        </button>
                      )}
                      {affiliate.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => decide(affiliate.id, 'rejected')}
                          className="rounded-btn bg-danger p-1.5 text-white transition-opacity hover:opacity-90"
                          aria-label={`Reject ${affiliate.name}`}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading affiliates…
        </p>
      )}
      {!loading && affiliates.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-ink-muted">No affiliate applications yet.</p>
      )}
    </Card>
  );
}
