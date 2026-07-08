'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, QrCode, Users } from 'lucide-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { cn } from '@/lib/utils';

const adminNav = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Orders', href: '/admin/orders', icon: Package },
  { label: 'Generate eSIM', href: '/admin/generate-esim', icon: QrCode },
  { label: 'Affiliates', href: '/admin/affiliates', icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminGate>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin <span className="text-accent">Panel</span>
          </h1>
          <span className="rounded-full bg-surface-3 px-3.5 py-1.5 text-xs font-medium text-ink-secondary">
            Internal · Domer Ops
          </span>
        </div>
        <div className="mb-8 flex flex-wrap gap-2">
          {adminNav.map((item) => {
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
