'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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

// One destination per entry. "Buy eSIM" and "Destinations" both pointed at
// /esim, which spends a menu slot to offer the same page twice.
const navGroups: NavGroup[] = [
  {
    labelKey: 'nav.esim',
    items: [
      { labelKey: 'nav.buyEsim', href: '/esim' },
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

// Routes that render on the night canvas. The bar has to wear the same sky —
// a white header over the deep-space funnel reads as a different product
// (see .claude/skills/ui-ux §9, concept continuity). Everything not listed
// here is a dense utility screen (dashboard, admin, auth, legal) that keeps
// the light bar for long-form legibility.
const NIGHT_ROUTES = [
  '/esim',
  '/cart',
  '/flights',
  '/track',
  '/airport-board',
  '/order-confirmation',
];

function isNightRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return NIGHT_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const count = useCart((s) => s.count());
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();
  const navRef = useRef<HTMLElement>(null);

  const night = isNightRoute(pathname);

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

  // Escape closes any open menu and returns focus to the page, and a click or
  // focus outside the bar dismisses the dropdown. Without these a keyboard
  // user who opens a menu has no way to leave it.
  useEffect(() => {
    if (!openDropdown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openDropdown]);

  const closeIfLeaving = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpenDropdown(null);
  }, []);

  // The Apsara hero is a standalone full-screen page with its own nav.
  if (pathname === '/apsara-hero') return null;

  const triggerClass = night
    ? 'text-white/75 hover:bg-white/10 hover:text-white'
    : 'text-ink-secondary hover:bg-surface-3 hover:text-ink';
  const focusRing = night
    ? 'focus-visible:ring-gold-light focus-visible:ring-offset-primary-deep'
    : 'focus-visible:ring-secondary focus-visible:ring-offset-white';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 ease-smooth backdrop-blur-xl',
        night
          ? scrolled
            ? 'border-b border-gold-light/15 bg-primary-deep/80 shadow-[0_8px_32px_rgba(2,8,23,0.45)]'
            : 'border-b border-transparent bg-primary-deep/35'
          : scrolled
            ? 'border-b border-line/80 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]'
            : 'border-b border-transparent bg-white/60'
      )}
    >
      <nav
        ref={navRef}
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"
        aria-label="Main"
      >
        {/* Logo */}
        <Link href="/" aria-label="Domer home" className={cn('rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2', focusRing)}>
          <DomerLogo surface={night ? 'navy' : 'light'} />
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
                onBlur={closeIfLeaving}
              >
                {/* A real toggle, not a hover-only target: this previously
                    opened solely on mouseenter, so the menu was unreachable by
                    keyboard and by touch. */}
                <button
                  type="button"
                  onClick={() =>
                    setOpenDropdown(openDropdown === group.labelKey ? null : group.labelKey)
                  }
                  className={cn(
                    'flex items-center gap-1 rounded-btn px-3.5 py-2 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    triggerClass,
                    focusRing
                  )}
                  aria-expanded={openDropdown === group.labelKey}
                  aria-controls={`nav-menu-${group.labelKey}`}
                  aria-haspopup="true"
                >
                  {t(group.labelKey)}
                  <ChevronDown
                    size={14}
                    className={cn(
                      'transition-transform duration-200 ease-smooth',
                      openDropdown === group.labelKey && 'rotate-180'
                    )}
                    aria-hidden="true"
                  />
                </button>
                <div
                  id={`nav-menu-${group.labelKey}`}
                  hidden={openDropdown !== group.labelKey}
                  className={cn(
                    'absolute left-0 top-full w-56 rounded-card p-2 animate-fade-up',
                    night
                      ? 'night-card border-gold-light/20'
                      : 'border border-line bg-white shadow-card-hover'
                  )}
                >
                  {group.items.map((item) => (
                    <Link
                      key={item.labelKey}
                      href={item.href}
                      className={cn(
                        'block rounded-btn px-3.5 py-2.5 text-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                        night
                          ? 'text-white/75 hover:bg-white/10 hover:text-white focus-visible:ring-gold-light'
                          : 'text-ink-secondary hover:bg-surface-2 hover:text-ink focus-visible:ring-secondary'
                      )}
                    >
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={group.labelKey}
                href={group.href!}
                className={cn(
                  'rounded-btn px-3.5 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  triggerClass,
                  focusRing
                )}
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
            className={cn(
              'flex min-h-[2.75rem] items-center gap-2 rounded-btn px-2.5 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              triggerClass,
              focusRing
            )}
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
            className={cn(
              'relative rounded-btn p-2.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              triggerClass,
              focusRing
            )}
            aria-label={
              cartCount > 0 ? `Cart with ${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Cart, empty'
            }
          >
            <ShoppingCart size={20} aria-hidden="true" />
            {cartCount > 0 && (
              // Dark ink on the gold pip — white on Angkor Gold is 2.6:1.
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-primary-deep">
                {cartCount}
              </span>
            )}
          </Link>

          <Link
            href="/sign-in"
            className={cn(
              'hidden rounded-btn px-3.5 py-2 text-sm font-medium transition-colors md:block',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              triggerClass,
              focusRing
            )}
          >
            {t('nav.signIn')}
          </Link>
          <Link
            href="/sign-up"
            className={cn(
              'liquid-glass-accent liquid-sheen hidden rounded-btn px-4 py-2 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-110 md:block',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              night ? 'focus-visible:ring-offset-primary-deep' : 'focus-visible:ring-offset-white'
            )}
          >
            {t('nav.getStarted')}
          </Link>

          <button
            type="button"
            className={cn(
              'rounded-btn p-2.5 transition-colors lg:hidden',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              triggerClass,
              focusRing
            )}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          id="mobile-nav"
          className={cn(
            'lg:hidden animate-fade-up',
            night ? 'border-t border-gold-light/15 bg-primary-deep/95' : 'border-t border-line bg-white'
          )}
        >
          <div className="space-y-1 px-4 py-4">
            {navGroups.map((group) => (
              <div key={group.labelKey}>
                {group.items ? (
                  <>
                    <p
                      className={cn(
                        'px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-widest',
                        night ? 'text-gold-light/70' : 'text-ink-muted'
                      )}
                    >
                      {t(group.labelKey)}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={item.labelKey}
                        href={item.href}
                        className={cn(
                          'block rounded-btn px-3 py-3 text-sm font-medium',
                          night ? 'text-white/75 hover:bg-white/10' : 'text-ink-secondary hover:bg-surface-2'
                        )}
                      >
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={group.href!}
                    className={cn(
                      'block rounded-btn px-3 py-3 text-sm font-medium',
                      night ? 'text-white/75 hover:bg-white/10' : 'text-ink-secondary hover:bg-surface-2'
                    )}
                  >
                    {t(group.labelKey)}
                  </Link>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-4">
              <Link
                href="/sign-in"
                className={cn(
                  'flex-1 rounded-btn px-4 py-3 text-center text-sm font-semibold',
                  night ? 'border border-white/20 text-white' : 'border border-line text-ink'
                )}
              >
                {t('nav.signIn')}
              </Link>
              <Link
                href="/sign-up"
                className="flex-1 rounded-btn bg-accent px-4 py-3 text-center text-sm font-semibold text-primary-deep"
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
