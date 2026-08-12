'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileSpreadsheet,
  Headphones,
  LayoutDashboard,
  Package,
  QrCode,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/lib/utils';

// Tabs are filtered by permission, not by role name. A tab appears because the
// caller can actually use it — so re-cutting the roles never leaves a nav entry
// pointing at a screen that 403s.
//
// This is presentation only. Every route behind these links re-checks the
// permission server-side.
const adminNav = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, permission: 'dashboard.view' },
  // Support sits high on purpose: when the phone rings, this is the screen
  // staff need, and hunting for it costs the customer's patience.
  { label: 'Support', href: '/admin/support', icon: Headphones, permission: 'customers.lookup' },
  { label: 'Orders', href: '/admin/orders', icon: Package, permission: 'orders.read' },
  { label: 'Reports', href: '/admin/reports', icon: FileSpreadsheet, permission: 'reports.export' },
  { label: 'Suppliers', href: '/admin/providers', icon: Server, permission: 'suppliers.manage' },
  { label: 'Generate eSIM', href: '/admin/generate-esim', icon: QrCode, permission: 'orders.fulfil' },
  { label: 'Affiliates', href: '/admin/affiliates', icon: Users, permission: 'affiliates.manage' },
  { label: 'Staff', href: '/admin/staff', icon: ShieldCheck, permission: 'staff.manage' },
];

const ROLE_LABEL: Record<string, string> = {
  viewer: 'Viewer',
  support: 'Call centre',
  ops: 'Operations',
  finance: 'Finance',
  admin: 'Administrator',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, role, unconfigured } = useSession();

  // With Supabase unconfigured there is no session to read a role from, so the
  // panel shows every tab rather than an empty shell. The API routes still
  // refuse every action.
  const visible = adminNav.filter((item) => unconfigured || can(item.permission));

  return (
    <AdminGate>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin <span className="text-accent">Panel</span>
          </h1>
          <span className="rounded-full bg-surface-3 px-3.5 py-1.5 text-xs font-medium text-ink-secondary">
            {role ? `${ROLE_LABEL[role] ?? role} · Domner Ops` : 'Internal · Domner Ops'}
          </span>
        </div>
        <div className="mb-8 flex flex-wrap gap-2">
          {visible.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-btn px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-secondary text-white shadow-sm'
                    : 'border border-line bg-white text-ink-secondary hover:border-secondary hover:text-secondary'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
        {children}
      </div>
    </AdminGate>
  );
}
