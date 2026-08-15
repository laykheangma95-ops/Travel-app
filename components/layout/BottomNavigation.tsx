'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Bottom navigation — the primary way around Domner on a phone.
//
// FIVE DESTINATIONS. Not seven, not ten. Each one is a phase of a journey
// rather than a feature of the product:
//
//   HOME     where you are in your journey right now
//   ESIM     what you can buy
//   TRIPS    what you are planning
//   FLIGHT   what is happening today
//   YOU      everything that is yours
//
// WHY THE STORE TOOK EXPLORE'S SLOT: the only thing Domner sells had no tab at
// all. It was reachable from a Home capsule, the desktop navbar and the footer
// — none of which is a persistent target on the phone, which is where the
// customers are. A five-tab bar that omits the product is a bar with a hole in
// it, and the sixth tab is not available: six targets do not fit a small screen
// at a comfortable tap size, and Khmer labels are longer than English ones.
//
// The owner chose Explore as the tab to give way, and chose the product name
// over a product-agnostic one. Both are recorded here because both have a
// cost that will come due:
//
//   1. Explore is the editorial layer — written destination guides, entry
//      requirements, real prices — and this bar was its ONLY persistent entry
//      point. Removing the tab without re-homing it would have orphaned it, so
//      the same change adds Explore to the navbar, the footer and the You
//      directory. If those links go, Explore effectively goes with them.
//   2. "eSIM" contradicts rule 1 (nothing hardcoded to eSIM — tours, hotels and
//      flights are coming). When a second product type ships, this tab needs a
//      rename to something product-agnostic, and returning customers will have
//      to relearn it. That is a known, accepted debt, not an oversight.
//
// Two rules it enforces, both from the brief:
//
//   1. NO SIGN-IN GATE. A guest sees the same five tabs and can use four of
//      them fully. Authentication happens when a feature needs to persist
//      something, not to draw the navigation (§3, §26).
//   2. IT GETS OUT OF THE WAY. During checkout, payment, authentication, the
//      admin panel and the full-screen hero, the bar hides — those are focused
//      flows where a tab bar is an invitation to abandon a purchase.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Map, Plane, Smartphone, User } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  /** Extra prefixes that should also light this tab up. */
  matches?: string[];
  icon: typeof Home;
  label: { en: string; km: string };
}

const TABS: Tab[] = [
  { href: '/', icon: Home, label: { en: 'Home', km: 'ដំបូង' } },
  {
    href: '/esim',
    // No `matches` needed: the /esim prefix already covers the finder, the
    // country pages and the plan pages. /my-esims deliberately stays on You —
    // an eSIM you already own is yours, not something to buy. And /cart needs
    // no entry here because it is in HIDDEN_ON below, where the bar does not
    // render at all.
    icon: Smartphone,
    label: { en: 'eSIM', km: 'eSIM' },
  },
  {
    href: '/trips',
    matches: ['/my-trips', '/checklist'],
    icon: Map,
    label: { en: 'Trips', km: 'ដំណើរ' },
  },
  {
    href: '/flights',
    matches: ['/airport-board', '/arrival', '/track'],
    icon: Plane,
    label: { en: 'Flight', km: 'ជើងហោះហើរ' },
  },
  {
    href: '/you',
    matches: ['/my-esims', '/settings', '/dashboard', '/updates'],
    icon: User,
    label: { en: 'You', km: 'អ្នក' },
  },
];

/**
 * Focused flows. A prefix match is enough — /esim/checkout hides the bar, and so
 * does anything under it.
 *
 * Note /esim itself is NOT here: the store is browsing, and browsing keeps its
 * navigation. Only the checkout inside it is focused.
 */
const HIDDEN_ON = [
  '/esim/checkout',
  '/cart',
  '/order-confirmation',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/admin',
  '/apsara-hero',
];

const HIDDEN_PATTERNS = [/^\/trips\/[^/]+\/itinerary(?:\/)?$/];

export function BottomNavigation() {
  const pathname = usePathname() ?? '/';
  const { lang } = useLang();
  const [unread, setUnread] = useState(0);

  const hidden =
    HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    HIDDEN_PATTERNS.some((pattern) => pattern.test(pathname));

  // The unread count is the one number worth carrying in the chrome. Fetched
  // once per mount, not polled: a badge that updates every ten seconds costs
  // battery on a phone that is already someone's only connection abroad.
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    fetch('/api/notifications/inbox', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { unread?: number } | null) => {
        if (!cancelled && typeof body?.unread === 'number') setUnread(body.unread);
      })
      // Signed out, offline, or unconfigured — all mean "no badge", which is
      // the correct rendering and not worth reporting.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hidden, pathname]);

  if (hidden) return null;

  return (
    <nav
      className="tabbar lg:hidden"
      aria-label={lang === 'km' ? 'ការនាំផ្លូវសំខាន់' : 'Primary'}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const active =
            tab.href === '/'
              ? pathname === '/'
              : pathname === tab.href ||
                pathname.startsWith(`${tab.href}/`) ||
                (tab.matches ?? []).some(
                  (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
                );

          const showBadge = tab.href === '/you' && unread > 0;

          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                className={cn('tabbar-item')}
                aria-current={active ? 'page' : undefined}
              >
                <tab.icon size={20} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
                <span>{tab.label[lang]}</span>
                {showBadge && (
                  <span className="tabbar-badge" aria-hidden="true">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                {showBadge && (
                  <span className="sr-only">
                    {lang === 'km' ? `${unread} ព័ត៌មានថ្មី` : `${unread} unread updates`}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
