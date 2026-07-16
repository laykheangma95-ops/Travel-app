'use client';

// Mobile super-app tab bar — the persistent bottom shell that makes Domner
// feel like an app, not a website. Shown on small screens only (the desktop
// top Navbar stays the primary nav ≥ md). Five destinations, with the AI
// Copilot raised in the centre the way Grab/Gojek elevate their core action.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Plane, Smartphone, Sparkles, User } from 'lucide-react';
import { useLang } from '@/lib/i18n';

type Tab = {
  href: string;
  match: (path: string) => boolean;
  icon: typeof Home;
  en: string;
  km: string;
};

const TABS: Tab[] = [
  { href: '/', match: (p) => p === '/', icon: Home, en: 'Home', km: 'ដើម' },
  { href: '/flights', match: (p) => p.startsWith('/flights') || p.startsWith('/airport') || p.startsWith('/track'), icon: Plane, en: 'Flights', km: 'ជើងហោះ' },
  { href: '/esim', match: (p) => p.startsWith('/esim') || p.startsWith('/cart'), icon: Smartphone, en: 'eSIM', km: 'eSIM' },
  { href: '/dashboard', match: (p) => p.startsWith('/dashboard') || p.startsWith('/my-') || p.startsWith('/settings') || p.startsWith('/sign'), icon: User, en: 'Me', km: 'គណនី' },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const { lang } = useLang();
  const label = (t: Tab) => (lang === 'km' ? t.km : t.en);

  const openCopilot = () => window.dispatchEvent(new CustomEvent('domner:open-copilot'));

  // Two tabs on each side of the raised centre Copilot button.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[80] md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between gap-1 border-t border-white/10 bg-[#0E1B30]/90 px-2 pt-1.5 pb-1 backdrop-blur-xl">
        {left.map((t) => (
          <TabLink key={t.href} tab={t} active={t.match(pathname)} label={label(t)} />
        ))}

        {/* Raised centre — AI Copilot */}
        <button
          type="button"
          onClick={openCopilot}
          aria-label={lang === 'km' ? 'បើកជំនួយការ' : 'Open Copilot'}
          className="relative -mt-6 flex w-[68px] shrink-0 flex-col items-center"
        >
          <span className="liquid-glass-accent liquid-sheen grid h-14 w-14 place-items-center rounded-full text-primary-deep shadow-[0_8px_22px_rgba(198,151,73,0.45)] ring-4 ring-[#0E1B30]/90 transition-transform duration-200 active:scale-95">
            <Sparkles size={24} aria-hidden="true" />
          </span>
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-gold-bright">
            {lang === 'km' ? 'ជំនួយ' : 'Copilot'}
          </span>
        </button>

        {right.map((t) => (
          <TabLink key={t.href} tab={t} active={t.match(pathname)} label={label(t)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ tab, active, label }: { tab: Tab; active: boolean; label: string }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors duration-200 ${
        active ? 'text-gold-bright' : 'text-white/55 hover:text-white/80'
      }`}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
      <span
        className={`h-1 w-1 rounded-full transition-all duration-200 ${
          active ? 'bg-gold-bright' : 'bg-transparent'
        }`}
      />
    </Link>
  );
}
