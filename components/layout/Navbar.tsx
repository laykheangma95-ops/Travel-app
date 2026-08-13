'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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

  /* ── The liquid indicator ────────────────────────────────────────────────
     One pill of light lives behind the whole link cluster and glides from item
     to item as you sweep across it, taking each one's exact width on the way.
     It is a single element, so the movement is continuous — the thing you are
     watching is the same thing the whole time, which is what makes it read as
     liquid rather than as five separate hover states blinking on and off.

     At rest it parks on the section you are actually in, so the bar answers
     "where am I" with the same object it uses to answer "what am I about to
     press". Nothing here is required to operate the nav: with JavaScript off,
     or before hydration, every link still works and still shows its focus ring.
     Measured from the DOM rather than hardcoded, because the labels are
     bilingual and Khmer is wider than English. */
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0, on: false });

  const glideTo = useCallback((el: HTMLElement | null) => {
    const list = listRef.current;
    if (!list || !el) return;
    const listBox = list.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setPill({ x: box.left - listBox.left, w: box.width, on: true });
  }, []);

  // Back to the current section — or out entirely, if you are somewhere the nav
  // does not cover.
  const restPill = useCallback(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (active) glideTo(active);
    else setPill((p) => ({ ...p, on: false }));
  }, [glideTo]);

  // Re-measure on navigation, on a language switch (the labels change width) and
  // on resize. Fonts land late, so also once the webfonts are ready — otherwise
  // the resting pill is sized to the fallback face.
  useEffect(() => {
    restPill();
    const onResize = () => restPill();
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(restPill).catch(() => {});
    return () => window.removeEventListener('resize', onResize);
  }, [pathname, lang, user, restPill]);

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
  //
  // The four auth screens are on this list because they are light pages: they
  // were not on it, so the dark bar rendered white labels on a white surface
  // and the entire nav was invisible on /sign-in, /sign-up and both password
  // screens. It only became obvious once the bar stopped painting its own
  // opaque band and started taking its ground from the page underneath.
  const lightSurfaces = [
    '/admin',
    '/dashboard',
    '/settings',
    '/my-esims',
    '/my-trips',
    '/privacy',
    '/terms',
    '/refunds',
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/reset-password',
  ];
  const onLight = lightSurfaces.some((r) => pathname.startsWith(r));
  const inkClass = onLight ? 'text-ink-secondary hover:text-ink' : 'text-white/80 hover:text-white';
  const pillClass = onLight ? 'nav-pill nav-pill-light' : 'nav-pill';

  // Which group owns the page you are on. The bar should always be able to
  // answer "where am I" without you reading it.
  const isActive = (group: NavGroup) =>
    group.href
      ? pathname.startsWith(group.href)
      : (group.items ?? []).some((i) => i.href !== '/' && pathname.startsWith(i.href));

  return (
    // The header is a transparent rail; the glass is the capsule inside it. That
    // way the bar floats over the globe (and over every page's artwork) instead
    // of cutting a hard band across the top of the sky.
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav
        className={cn(
          'mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full py-2 pl-2.5 pr-2.5 sm:pl-3',
          'nav-liquid',
          onLight && 'nav-liquid-light',
          scrolled && 'nav-liquid-scrolled'
        )}
        aria-label="Main"
        // Opts the capsule into the global pointer tracker, which writes the
        // cursor position into --gx/--gy for the specular highlight.
        data-liquid
      >
        {/* Brand — the one circle in a bar of capsules, so it reads as the way
            home without needing a label to say so. */}
        <Link href="/" className="nav-brand shrink-0">
          <DomerLogo surface={onLight ? 'light' : 'navy'} badge size={44} />
        </Link>

        {/* Desktop nav */}
        <div
          ref={listRef}
          className="relative hidden items-center gap-1 lg:flex"
          onMouseLeave={restPill}
        >
          {/* The travelling pill. Purely decorative — every link below is a real
              link with its own focus ring. */}
          <span
            className={cn('nav-indicator', pill.on && 'is-on', onLight && 'nav-indicator-light')}
            aria-hidden="true"
            style={{ transform: `translate3d(${pill.x}px, 0, 0)`, width: pill.w }}
          />
          {navGroups.map((group) =>
            group.items ? (
              <div
                key={group.labelKey}
                className="relative"
                onMouseEnter={(e) => {
                  setOpenDropdown(group.labelKey);
                  glideTo(e.currentTarget.querySelector('button'));
                }}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  type="button"
                  className={`nav-link ${inkClass}`}
                  aria-expanded={openDropdown === group.labelKey}
                  data-open={openDropdown === group.labelKey}
                  data-active={isActive(group)}
                  onFocus={(e) => glideTo(e.currentTarget)}
                >
                  {t(group.labelKey)}
                  <ChevronDown
                    size={14}
                    className="transition-transform duration-200 ease-smooth"
                    style={{ transform: openDropdown === group.labelKey ? 'rotate(180deg)' : undefined }}
                  />
                </button>
                {openDropdown === group.labelKey && (
                  // The pt-2 is the hover bridge: the gap between the pill and
                  // the menu has to belong to the menu, or crossing it closes it.
                  <div className="absolute left-0 top-full w-56 pt-2">
                    <div className="nav-menu-glass rounded-card p-2 animate-fade-up">
                      {group.items.map((item) => (
                        <Link
                          key={item.labelKey}
                          href={item.href}
                          className="block rounded-btn px-3.5 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          {t(item.labelKey)}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={group.labelKey}
                href={group.href!}
                className={`nav-link ${inkClass}`}
                data-active={isActive(group)}
                onMouseEnter={(e) => glideTo(e.currentTarget)}
                onFocus={(e) => glideTo(e.currentTarget)}
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
            className={`${pillClass} flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-medium transition-colors ${inkClass}`}
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
            className={`${pillClass} relative rounded-full p-2.5 transition-colors ${inkClass}`}
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
                className={`${pillClass} flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-medium transition-colors ${inkClass}`}
                aria-expanded={accountOpen}
                data-open={accountOpen}
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
                  className="nav-menu-glass absolute right-0 top-full mt-2 w-64 rounded-card p-2 animate-fade-up"
                >
                  <div className="border-b border-white/10 px-3 pb-2.5 pt-1.5">
                    <p className="text-[11px] uppercase tracking-widest text-white/50">
                      {t('nav.signedInAs')}
                    </p>
                    {/* The address is the answer to "did my account save?", so
                        it is shown in full rather than truncated to an
                        initial. */}
                    <p className="mt-0.5 break-all text-sm font-medium text-white">{user.email}</p>
                  </div>

                  <Link
                    href="/my-esims"
                    role="menuitem"
                    className="mt-1 block rounded-btn px-3.5 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {t('nav.myEsims')}
                  </Link>
                  <Link
                    href="/dashboard"
                    role="menuitem"
                    className="block rounded-btn px-3.5 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    className="block rounded-btn px-3.5 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {t('nav.settings')}
                  </Link>

                  {/* Server-verified — useSession asks /api/admin/session
                      rather than guessing from the email. */}
                  {isAdmin && (
                    <Link
                      href="/admin"
                      role="menuitem"
                      className="flex items-center gap-2 rounded-btn px-3.5 py-2.5 text-sm font-medium text-gold-light transition-colors hover:bg-white/10"
                    >
                      <ShieldCheck size={15} aria-hidden="true" />
                      {t('nav.adminPanel')}
                    </Link>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    className="mt-1 flex w-full items-center gap-2 rounded-btn border-t border-white/10 px-3.5 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
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
                className={`${pillClass} hidden rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${inkClass} md:block`}
              >
                {t('nav.signIn')}
              </Link>
              <Link
                href="/sign-up"
                className="liquid-glass-accent liquid-sheen liquid-press hidden rounded-full px-4 py-2 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-110 md:block"
              >
                {t('nav.getStarted')}
              </Link>
            </>
          )}

          <button
            type="button"
            className={`${pillClass} rounded-full p-2.5 transition-colors ${inkClass} lg:hidden`}
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
        <div className="nav-menu-glass mx-auto mt-2 max-w-7xl rounded-card lg:hidden animate-fade-up">
          <div className="space-y-1 px-4 py-4">
            {navGroups.map((group) => (
              <div key={group.labelKey}>
                {group.items ? (
                  <>
                    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-widest text-accent">
                      {t(group.labelKey)}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={item.labelKey}
                        href={item.href}
                        className="block rounded-btn px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                      >
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={group.href!}
                    className="block rounded-btn px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    {t(group.labelKey)}
                  </Link>
                )}
              </div>
            ))}
            {/* Most of our customers are on a phone, so the drawer carries the
                full account section rather than a cut-down version of it. */}
            {user ? (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="px-3 text-xs uppercase tracking-widest text-white/50">
                  {t('nav.signedInAs')}
                </p>
                <p className="mt-0.5 break-all px-3 text-sm font-medium text-white">{user.email}</p>

                <Link
                  href="/dashboard"
                  className="mt-2 flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <User size={16} aria-hidden="true" />
                  {t('nav.dashboard')}
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                >
                  {t('nav.settings')}
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium text-gold-light hover:bg-white/10"
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    {t('nav.adminPanel')}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="liquid-glass liquid-press mt-2 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <LogOut size={16} aria-hidden="true" />
                  {t('nav.signOut')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 pt-4">
                <Link
                  href="/sign-in"
                  className="liquid-glass liquid-press flex-1 rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  {t('nav.signIn')}
                </Link>
                <Link
                  href="/sign-up"
                  className="liquid-glass-accent liquid-sheen liquid-press flex-1 rounded-full px-4 py-2.5 text-center text-sm font-semibold text-primary-deep"
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
