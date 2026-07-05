import { Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

// Demo orders — served from esim_orders in Supabase once connected.
const esims = [
  {
    orderNumber: 'DN-2026-4821',
    country: 'Thailand',
    flag: '🇹🇭',
    plan: 'Standard',
    duration: 7,
    dataDaily: 2,
    status: 'active' as const,
    daysLeft: 5,
    dataUsedPct: 42,
  },
  {
    orderNumber: 'DN-2026-3390',
    country: 'Japan',
    flag: '🇯🇵',
    plan: 'Premium',
    duration: 15,
    dataDaily: 3,
    status: 'expired' as const,
    daysLeft: 0,
    dataUsedPct: 100,
  },
];

const statusTone = { active: 'success', pending: 'warning', expired: 'neutral' } as const;

export default function MyEsimsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">My eSIMs</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Your data plans, QR codes, and usage in one place.
        </p>
      </div>

      {esims.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="No eSIMs yet"
          description="Buy your first eSIM and it will appear here with its QR code."
          ctaLabel="Browse eSIM plans"
          ctaHref="/esim"
        />
      ) : (
        <div className="space-y-4">
          {esims.map((e) => (
            <Card key={e.orderNumber} className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <span className="text-4xl" role="img" aria-label={`${e.country} flag`}>
                    {e.flag}
                  </span>
                  <div>
                    <h2 className="font-display font-bold text-ink">
                      {e.country} — {e.plan}
                    </h2>
                    <p className="text-sm text-ink-secondary">
                      {e.duration} days · {e.dataDaily}GB/day ·{' '}
                      <span className="font-mono text-xs">{e.orderNumber}</span>
                    </p>
                  </div>
                </div>
                <Badge tone={statusTone[e.status]}>{e.status}</Badge>
              </div>
              {e.status === 'active' && (
                <ProgressBar
                  value={e.dataUsedPct}
                  tone="secondary"
                  label={`${e.daysLeft} days left · ${e.dataUsedPct}% of today's data used`}
                  className="mt-5"
                />
              )}
              <div className="mt-5 flex gap-3 border-t border-line pt-5">
                <Button variant="outline" size="sm">
                  View QR code
                </Button>
                <Button variant="ghost" size="sm" href="https://t.me/domnerapp">
                  Get support
                </Button>
                {e.status === 'expired' && (
                  <Button size="sm" href="/esim">
                    Buy again
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
