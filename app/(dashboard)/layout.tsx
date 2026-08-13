'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Map,
  Smartphone,
  BellRing,
  UserRound,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Trips', href: '/trips', icon: Map },
  { label: 'My eSIMs', href: '/my-esims', icon: Smartphone },
  { label: 'Updates', href: '/updates', icon: BellRing },
  { label: 'You', href: '/you', icon: UserRound },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    // has-tabbar reserves the safe-area-aware room the global bottom bar needs,
    // so the last row of a dashboard screen is never hidden behind it.
    <div className="has-tabbar mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6">
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

      <div className="min-w-0 flex-1">{children}</div>

      {/* No mobile bottom tabs here any more.
          This layout used to render its own fixed bottom bar. The app now has a
          single global one (components/layout/BottomNavigation.tsx), and two
          stacked fixed bars is both a visual bug and two competing answers to
          "where am I?". The desktop sidebar above stays — it is the right shape
          for a wide utility screen, and the global tab bar is mobile-only. */}
    </div>
  );
}
