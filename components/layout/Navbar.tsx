'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, Menu, ShoppingCart, X } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { cn } from '@/lib/utils';

interface NavGroup {
  label: string;
  href?: string;
  items?: { label: string; href: string }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'eSIM',
    items: [
      { label: 'Buy eSIM', href: '/esim' },
      { label: 'Destinations', href: '/esim' },
      { label: 'My eSIMs', href: '/my-esims' },
    ],
  },
  {
    label: 'Flights',
    items: [
      { label: 'Flight Tracker', href: '/flights' },
      { label: 'Saved Flights', href: '/dashboard' },
    ],
  },
  {
    label: 'Travel Tools',
    items: [
      { label: 'Am I Ready? Checklist', href: '/checklist' },
      { label: 'Airport Guide', href: '/airport-guide' },
      { label: 'Emergency Phrases', href: '/emergency' },
    ],
  },
  { label: 'Support', href: '/affiliate' },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [lang, setLang] = useState<'EN' | 'KM'>('EN');
  const [cartCount, setCartCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const count = useCart((s) => s.count());
  const pathname = usePathname();

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
        <Link href="/" className="font-display text-xl font-extrabold tracking-tight" aria-label="Domner App home">
          <span className="text-secondary">Domner</span>
          <span className="text-accent">App</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navGroups.map((group) =>
            group.items ? (
              <div
                key={group.label}
                className="relative"
                onMouseEnter={() => setOpenDropdown(group.label)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-btn px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
                  aria-expanded={openDropdown === group.label}
                >
                  {group.label}
                  <ChevronDown size={14} />
                </button>
                {openDropdown === group.label && (
                  <div className="absolute left-0 top-full w-52 rounded-card border border-line bg-white p-2 shadow-card-hover animate-fade-up">
                    {group.items.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="block rounded-btn px-3.5 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={group.label}
                href={group.href!}
                className="rounded-btn px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
              >
                {group.label}
              </Link>
            )
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === 'EN' ? 'KM' : 'EN')}
            className="hidden rounded-btn px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-3 sm:block"
            aria-label="Toggle language"
          >
            {lang === 'EN' ? '🇬🇧 EN' : '🇰🇭 KM'}
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
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="liquid-glass-accent liquid-sheen hidden rounded-btn px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 md:block"
          >
            Get Started
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
              <div key={group.label}>
                {group.items ? (
                  <>
                    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="block rounded-btn px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-2"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={group.href!}
                    className="block rounded-btn px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-2"
                  >
                    {group.label}
                  </Link>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-4">
              <Link
                href="/sign-in"
                className="flex-1 rounded-btn border border-line px-4 py-2.5 text-center text-sm font-semibold text-ink"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="flex-1 rounded-btn bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
