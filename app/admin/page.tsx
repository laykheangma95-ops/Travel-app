import { DollarSign, Package, TrendingUp, Users, Plane, LifeBuoy } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// Demo metrics — real values are aggregated from Supabase once connected.
const stats = [
  { label: 'Orders today', value: '14', icon: Package, change: '+3 vs yesterday' },
  { label: 'Orders this week', value: '87', icon: TrendingUp, change: '+12%' },
  { label: 'Revenue this month', value: '$2,840', icon: DollarSign, change: '+18%' },
  { label: 'Active users', value: '1,203', icon: Users, change: '+241 this month' },
];

const recentOrders = [
  { number: 'DN-2026-4821', country: 'Thailand 🇹🇭', plan: 'Standard', total: 9.99, status: 'paid' as const },
  { number: 'DN-2026-4820', country: 'Vietnam 🇻🇳', plan: 'Basic', total: 3.99, status: 'fulfilled' as const },
  { number: 'DN-2026-4819', country: 'Japan 🇯🇵', plan: 'Premium', total: 25.99, status: 'pending' as const },
  { number: 'DN-2026-4818', country: 'Singapore 🇸🇬', plan: 'Standard', total: 10.99, status: 'fulfilled' as const },
];

const statusTone = { paid: 'info', fulfilled: 'success', pending: 'warning' } as const;

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{s.label}</p>
              <s.icon size={17} className="text-accent" aria-hidden="true" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ink">{s.value}</p>
            <p className="mt-1 text-xs text-success">{s.change}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent orders */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 font-display font-bold text-ink">Recent orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-3 pr-4 font-medium">Order</th>
                  <th className="pb-3 pr-4 font-medium">Country</th>
                  <th className="pb-3 pr-4 font-medium">Plan</th>
                  <th className="pb-3 pr-4 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentOrders.map((o) => (
                  <tr key={o.number}>
                    <td className="py-3 pr-4 font-mono text-xs">{o.number}</td>
                    <td className="py-3 pr-4">{o.country}</td>
                    <td className="py-3 pr-4">{o.plan}</td>
                    <td className="py-3 pr-4 font-semibold">${o.total.toFixed(2)}</td>
                    <td className="py-3">
                      <Badge tone={statusTone[o.status]}>{o.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Side widgets */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-display font-bold text-ink">
              <Plane size={17} className="text-accent" aria-hidden="true" /> Flight alerts
            </h2>
            <p className="mt-2 text-sm text-ink-secondary">
              <strong className="text-ink">31 users</strong> are tracking flights right now.
            </p>
            <p className="mt-1 text-xs text-ink-muted">2 delayed flights need manual notifications.</p>
          </Card>
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-display font-bold text-ink">
              <LifeBuoy size={17} className="text-accent" aria-hidden="true" /> Support tickets
            </h2>
            <p className="mt-2 text-sm text-ink-secondary">
              <strong className="text-ink">3 open tickets</strong> · 1 high priority
            </p>
            <p className="mt-1 text-xs text-ink-muted">Oldest ticket: 2 hours ago</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
