'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Loader2, RefreshCw, XCircle, Zap } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

// Supplier routing at a glance: who is primary, who is configured, whose
// circuit is open, and whether orders are being delivered automatically.

interface ProviderHealth {
  state: 'healthy' | 'degraded' | 'unconfigured' | 'down';
  latencyMs: number | null;
  message: string | null;
  checkedAt: string;
}

interface EsimProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  circuitOpen: boolean;
  consecutiveFailures: number;
  preferenceRank: number | null;
  coveredPlans: number;
  health: ProviderHealth | null;
}

interface PaymentProviderStatus {
  id: string;
  label: string;
  configured: boolean;
}

const healthTone = {
  healthy: 'success',
  degraded: 'warning',
  unconfigured: 'neutral',
  down: 'danger',
} as const;

export default function AdminProvidersPage() {
  const [esim, setEsim] = useState<EsimProviderStatus[]>([]);
  const [payments, setPayments] = useState<PaymentProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/providers', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        esim?: EsimProviderStatus[];
        payments?: PaymentProviderStatus[];
        error?: { message?: string };
      } | null;

      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load provider status.');

      setEsim(data?.esim ?? []);
      setPayments(data?.payments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load provider status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const autoFulfilment = esim.some((p) => p.configured && !p.circuitOpen && p.health?.state !== 'down');
  const ordered = [...esim].sort((a, b) => {
    if (a.preferenceRank === null) return 1;
    if (b.preferenceRank === null) return -1;
    return a.preferenceRank - b.preferenceRank;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Suppliers &amp; gateways</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Orders route to the first supplier that is configured, healthy, and carries the plan.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-sm text-ink-secondary transition-colors hover:border-secondary hover:text-secondary"
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} aria-hidden="true" />
          Re-check
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      <Card
        className={cn(
          'flex items-start gap-3 p-5',
          autoFulfilment ? 'border-green-200 bg-green-50' : 'border-amber-300 bg-amber-50'
        )}
      >
        {autoFulfilment ? (
          <Zap size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Activity size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-semibold text-ink">
            {autoFulfilment ? 'Automatic delivery is active' : 'Manual delivery only'}
          </p>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {autoFulfilment
              ? 'Paid orders are provisioned and emailed without anyone touching them.'
              : 'No supplier is available, so paid orders wait in the queue for manual delivery. Customers are not told their eSIM is ready.'}
          </p>
        </div>
      </Card>

      <Card className="overflow-x-auto p-6">
        <h3 className="mb-4 font-display font-bold text-ink">eSIM suppliers</h3>

        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">eSIM supplier routing status</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <th scope="col" className="pb-3 pr-4 font-medium">Priority</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Supplier</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Configured</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Coverage</th>
              <th scope="col" className="pb-3 pr-4 font-medium">Health</th>
              <th scope="col" className="pb-3 font-medium">Rotation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ordered.map((provider) => (
              <tr key={provider.id}>
                <td className="py-3.5 pr-4">
                  {provider.preferenceRank === null ? (
                    <span className="text-ink-muted">—</span>
                  ) : provider.preferenceRank === 0 ? (
                    <Badge tone="info">Primary</Badge>
                  ) : (
                    <span className="text-ink-secondary">#{provider.preferenceRank + 1}</span>
                  )}
                </td>
                <td className="py-3.5 pr-4">
                  <p className="font-medium">{provider.name}</p>
                  <p className="font-mono text-xs text-ink-muted">{provider.id}</p>
                </td>
                <td className="py-3.5 pr-4">
                  {provider.configured ? (
                    <CheckCircle2 size={16} className="text-success" aria-label="Configured" />
                  ) : (
                    <XCircle size={16} className="text-ink-muted" aria-label="Not configured" />
                  )}
                </td>
                <td className="py-3.5 pr-4">
                  {provider.id === 'sandbox' ? (
                    <span className="text-ink-secondary">All plans</span>
                  ) : provider.coveredPlans > 0 ? (
                    <span className="text-ink-secondary">{provider.coveredPlans} plans</span>
                  ) : (
                    <span className="text-ink-muted">No SKUs mapped</span>
                  )}
                </td>
                <td className="py-3.5 pr-4">
                  {provider.health ? (
                    <div className="flex items-center gap-2">
                      <Badge tone={healthTone[provider.health.state]}>{provider.health.state}</Badge>
                      {provider.health.latencyMs !== null && provider.health.state !== 'unconfigured' && (
                        <span className="text-xs text-ink-muted">{provider.health.latencyMs}ms</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="py-3.5">
                  {provider.circuitOpen ? (
                    <span className="text-xs font-medium text-danger">
                      Suspended · {provider.consecutiveFailures} failures
                    </span>
                  ) : provider.configured ? (
                    <span className="text-xs text-success">In rotation</span>
                  ) : (
                    <span className="text-xs text-ink-muted">Idle</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && esim.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Probing suppliers…
          </p>
        )}

        <p className="mt-5 border-t border-line pt-4 text-xs text-ink-muted">
          Priority comes from <code className="font-mono">ESIM_PROVIDER_ORDER</code>. A supplier
          that fails three times in a row is suspended for 60 seconds, then probed again.
          Suspension is automatic and self-healing — no deploy is needed to recover.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-display font-bold text-ink">Payment gateways</h3>
        <ul className="space-y-2.5">
          {payments.map((provider) => (
            <li key={provider.id} className="flex items-center justify-between text-sm">
              <span>
                {provider.label}{' '}
                <span className="font-mono text-xs text-ink-muted">({provider.id})</span>
              </span>
              <Badge tone={provider.configured ? 'success' : 'neutral'}>
                {provider.configured ? 'Live' : 'Not configured'}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
