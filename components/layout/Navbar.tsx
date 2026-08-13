'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, LogOut, Menu, ShieldCheck, ShoppingCart, User, X } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useSession } from '@/hooks/useSession';
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const count = useCart((s) => s.count());
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();

  // The header never showed a signed-in state at all: it offered "Sign In" and
  // "Get Started" to everyone, forever, and there was nowhere on the site to
  // sign out. `useSession` has exposed signOut() the whole time — nothing
  // called it.
  //
  // That absence is also why creating an account felt like it had not saved.
  // You sign up, you come back to the site, and the header still says "Sign In"
  // — which reads as "we have no record of you". The account was there; the
  // header was simply not looking.
  const { user, isAdmin, loading, signOut } = useSession();

  // Cart count is read after mount to avoid SSR/localStorage hydration mismatch.
  useEffect(() => setCartCount(count), [count]);
  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
    setAccountOpen(false);
  }, [pathname]);

  // Frosted bar gains depth once the page starts scrolling.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Click-away and Escape, because this menu holds the only sign-out button on
  // the site and a menu you cannot dismiss is worse than no menu.
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[data-account-menu]')) setAccountOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  // Sign out, then leave. Staying put would land a signed-out visitor on a
  // page they can no longer read — their eSIMs, their settings — and the empty
  // screen looks like data loss rather than a sign-out.
  const handleSignOut = async () => {
    setAccountOpen(false);
    setMobileOpen(false);
    await signOut();
    window.location.href = '/';
  };

  const accountLabel = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';
  const initial = accountLabel.trim().charAt(0).toUpperCase() || '?';

  // The Apsara hero is a standalone full-screen page with its own nav.
  if (pathname === '/apsara-hero') return null;

  // The brand is Temple *Night*, so the header is dark by default and light
  // only on the documented utility surfaces (§9.1 of the ui-ux skill: the
  // concept has to survive the whole funnel). Previously it was light
  // everywhere, which put a strip of daylight across the top of every night
  // page on the site — the store, the plan pages, the cart, the checkout, the
  // flight tracker. One inconsistent element repeated on every screen does more
  // damage to a premium feeling than any single page can repair.
  const lightSurfaces = ['/admin', '/dashboard', '/settings', '/my-esims', '/my-trips', '/privacy', '/terms', '/refunds'];
  const onLight = lightSurfaces.some((r) => pathname.startsWith(r));
  const inkClass = onLight
    ? 'text-ink-secondary hover:bg-surface-3 hover:text-ink'
    : 'text-white/75 hover:bg-white/10 hover:text-white';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 ease-smooth backdrop-blur-xl',
        onLight
          ? scrolled
            ? 'border-b border-line/80 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]'
            : 'border-b border-transparent bg-white/60'
          : scrolled
            ? 'border-b border-white/10 bg-[#060e24]/85 shadow-[0_8px_24px_rgba(3,8,30,0.45)]'
            : 'border-b border-transparent bg-[#060e24]/45'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        {/* Logo */}
        <Link href="/">
          <DomerLogo surface={onLight ? 'light' : 'navy'} />
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
                  className={`flex items-center gap-1 rounded-btn px-3.5 py-2 text-sm font-medium transition-colors ${inkClass}`}
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
                className={`rounded-btn px-3.5 py-2 text-sm font-medium transition-colors ${inkClass}`}
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
            className={`flex items-center gap-2 rounded-btn px-2.5 py-2 text-sm font-medium transition-colors ${inkClass}`}
            // WCAG 2.5.3 — the accessible name has to contain the visible text
            // ("EN" / "KM"), or voice-control users cannot say what they see.
            aria-label={lang === 'en' ? 'EN — ប្តូរទៅភាសាខ្មែរ' : 'KM — Switch to English'}
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
            className={`relative rounded-btn p-2.5 transition-colors ${inkClass}`}
            aria-label={`Cart with ${cartCount} items`}
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>

          {/* While the session is still resolving we show neither state. A
              flash of "Sign In" for someone who is signed in is the exact
              wrong message, and it is the one people remember. */}
          {loading ? (
            <span className="hidden h-9 w-24 animate-pulse rounded-btn bg-white/10 md:block" aria-hidden="true" />
          ) : user ? (
            <div className="relative hidden md:block" data-account-menu>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className={`flex items-center gap-2 rounded-btn px-2.5 py-2 text-sm font-medium transition-colors ${inkClass}`}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label={`${t('nav.account')} — ${accountLabel}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary-deep">
                  {initial}
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-64 rounded-card border border-line bg-white p-2 shadow-card-hover animate-fade-up"
                >
                  <div className="border-b border-line px-3 pb-2.5 pt-1.5">
                    <p className="text-[11px] uppercase tracking-widest text-ink-muted">
                      {t('nav.signedInAs')}
                    </p>
                    {/* The address is the answer to "did my account save?", so
                        it is shown in full rather than truncated to an
                        initial. */}
                    <p className="mt-0.5 break-all text-sm font-medium text-ink">{user.email}</p>
                  </div>

                  <Link
                    href="/my-esims"
                    role="menuitem"
                    className="mt-1 block rounded-btn px-3.5 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {t('nav.myEsims')}
                  </Link>
                  <Link
                    href="/dashboard"
                    role="menuitem"
                    className="block rounded-btn px-3.5 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    className="block rounded-btn px-3.5 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {t('nav.settings')}
                  </Link>

                  {/* Server-verified — useSession asks /api/admin/session
                      rather than guessing from the email. */}
                  {isAdmin && (
                    <Link
                      href="/admin"
                      role="menuitem"
                      className="flex items-center gap-2 rounded-btn px-3.5 py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-2"
                    >
                      <ShieldCheck size={15} aria-hidden="true" />
                      {t('nav.adminPanel')}
                    </Link>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    className="mt-1 flex w-full items-center gap-2 rounded-btn border-t border-line px-3.5 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <LogOut size={15} aria-hidden="true" />
                    {t('nav.signOut')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={`hidden rounded-btn px-3.5 py-2 text-sm font-medium transition-colors ${inkClass} md:block`}
              >
                {t('nav.signIn')}
              </Link>
              <Link
                href="/sign-up"
                className="liquid-glass-accent liquid-sheen hidden rounded-btn px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 md:block"
              >
                {t('nav.getStarted')}
              </Link>
            </>
          )}

          <button
            type="button"
            className={`rounded-btn p-2.5 transition-colors ${inkClass} lg:hidden`}
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
            {/* Most of our customers are on a phone, so the drawer carries the
                full account section rather than a cut-down version of it. */}
            {user ? (
              <div className="mt-4 border-t border-line pt-4">
                <p className="px-3 text-xs uppercase tracking-widest text-ink-muted">
                  {t('nav.signedInAs')}
                </p>
                <p className="mt-0.5 break-all px-3 text-sm font-medium text-ink">{user.email}</p>

                <Link
                  href="/dashboard"
                  className="mt-2 flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-2"
                >
                  <User size={16} aria-hidden="true" />
                  {t('nav.dashboard')}
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-2"
                >
                  {t('nav.settings')}
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-secondary hover:bg-surface-2"
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    {t('nav.adminPanel')}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-btn border border-line px-4 py-2.5 text-sm font-semibold text-ink"
                >
                  <LogOut size={16} aria-hidden="true" />
                  {t('nav.signOut')}
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </header>
  );
}
