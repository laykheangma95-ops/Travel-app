'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, Menu, ShoppingCart, X } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { DomerLogo } from '@/components/brand/DomerMark';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang, type DictKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface NavGroup {
  labelKey: DictKey;
  href?: string;
  items?: { labelKey: DictKey; href: string }[];
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'nav.esim',
    items: [
      { labelKey: 'nav.buyEsim', href: '/esim' },
      { labelKey: 'nav.destinations', href: '/esim' },
      { labelKey: 'nav.myEsims', href: '/my-esims' },
    ],
  },
  {
    labelKey: 'nav.flights',
    items: [
      { labelKey: 'nav.flightTracker', href: '/flights' },
      { labelKey: 'nav.airportBoard', href: '/airport-board/KTI' },
      { labelKey: 'nav.savedFlights', href: '/dashboard' },
    ],
  },
  {
    labelKey: 'nav.tools',
    items: [
      { labelKey: 'nav.checklist', href: '/checklist' },
      { labelKey: 'nav.airportGuide', href: '/airport-guide' },
      { labelKey: 'nav.emergency', href: '/emergency' },
    ],
  },
  { labelKey: 'nav.support', href: '/affiliate' },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const count = useCart((s) => s.count());
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();

  // Cart count is read after mount to avoid SSR/localStorage hydration mismatch.
  useEffect(() => setCartCount(count), [count]);
  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [pathname]);

  // Frosted bar gains depth once the page starts scrolling.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The Apsara hero is a standalone full-screen page with its own nav.
  if (pathname === '/apsara-hero') return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 ease-smooth backdrop-blur-xl',
        scrolled
          ? 'border-b border-line/80 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]'
          : 'border-b border-transparent bg-white/60'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        {/* Logo */}
        <Link href="/" aria-label="Domer home">
          <DomerLogo surface="light" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navGroups.map((group) =>
            group.items ? (
              <div
                key={group.labelKey}
                className="relative"
                onMouseEnter={() => setOpenDropdown(group.labelKey)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-btn px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
                  aria-expanded={openDropdown === group.labelKey}
                >
                  {t(group.labelKey)}
                  <ChevronDown size={14} />
                </button>
                {openDropdown === group.labelKey && (
                  <div className="absolute left-0 top-full w-56 rounded-card border border-line bg-white p-2 shadow-card-hover animate-fade-up">
                    {group.items.map((item) => (
                      <Link
                        key={item.labelKey}
                        href={item.href}
                        className="block rounded-btn px-3.5 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={group.labelKey}
                href={group.href!}
                className="rounded-btn px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
              >
                {t(group.labelKey)}
              </Link>
            )
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'km' : 'en')}
            className="flex items-center gap-2 rounded-btn px-2.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3"
            aria-label={lang === 'en' ? 'ប្តូរទៅភាសាខ្មែរ' : 'Switch to English'}
          >
            <WavyFlag
              flag={lang === 'en' ? '🇬🇧' : '🇰🇭'}
              label={lang === 'en' ? 'English' : 'ភាសាខ្មែរ'}
              size={26}
            />
            {lang === 'en' ? 'EN' : 'KM'}
          </button>

          <Link
            href="/cart"
            className="relative rounded-btn p-2.5 text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
            aria-label={`Cart with ${cartCount} items`}
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>

          <Link
            href="/sign-in"
            className="hidden rounded-btn px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink md:block"
          >
            {t('nav.signIn')}
          </Link>
          <Link
            href="/sign-up"
            className="liquid-glass-accent liquid-sheen hidden rounded-btn px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 md:block"
          >
            {t('nav.getStarted')}
          </Link>

          <button
            type="button"
            className="rounded-btn p-2.5 text-ink-secondary transition-colors hover:bg-surface-3 lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-line bg-white lg:hidden animate-fade-up">
          <div className="space-y-1 px-4 py-4">
            {navGroups.map((group) => (
              <div key={group.labelKey}>
                {group.items ? (
                  <>
                    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                      {t(group.labelKey)}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={item.labelKey}
                        href={item.href}
                        className="block rounded-btn px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-2"
                      >
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={group.href!}
                    className="block rounded-btn px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-2"
                  >
                    {t(group.labelKey)}
                  </Link>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-4">
              <Link
                href="/sign-in"
                className="flex-1 rounded-btn border border-line px-4 py-2.5 text-center text-sm font-semibold text-ink"
              >
                {t('nav.signIn')}
              </Link>
              <Link
                href="/sign-up"
                className="flex-1 rounded-btn bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                {t('nav.getStarted')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
