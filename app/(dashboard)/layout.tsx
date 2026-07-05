'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Map,
  Smartphone,
  BellRing,
  Camera,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Trips', href: '/my-trips', icon: Map },
  { label: 'My eSIMs', href: '/my-esims', icon: Smartphone },
  { label: 'Flight Alerts', href: '/flights', icon: BellRing },
  { label: 'Memories', href: '/trips', icon: Camera },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 lg:block" aria-label="Dashboard navigation">
        <nav className="sticky top-24 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-btn px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-secondary text-white shadow-sm'
                    : 'text-ink-secondary hover:bg-surface-3 hover:text-ink'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white/95 backdrop-blur-lg lg:hidden"
        aria-label="Dashboard navigation"
      >
        {navItems.slice(0, 5).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                active ? 'text-accent' : 'text-ink-muted'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon size={19} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
