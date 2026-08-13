'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Facebook, Send, Music2 } from 'lucide-react';
import { DomerLogo } from '@/components/brand/DomerMark';
import { useLang, type DictKey } from '@/lib/i18n';

const columns: { titleKey: DictKey; links: { labelKey: DictKey; href: string }[] }[] = [
  {
    titleKey: 'footer.esim',
    links: [
      { labelKey: 'footer.destinations', href: '/esim' },
      // See the note in BottomNavigation.tsx: Explore no longer has a tab, so
      // this link and the navbar's are what keep the guides reachable.
      { labelKey: 'footer.explore', href: '/explore' },
      { labelKey: 'footer.how', href: '/#how-it-works' },
      { labelKey: 'footer.install', href: '/esim/vietnam#install' },
      { labelKey: 'footer.faq', href: '/esim/vietnam#faq' },
    ],
  },
  {
    titleKey: 'footer.tools',
    links: [
      { labelKey: 'footer.tracker', href: '/flights' },
      { labelKey: 'footer.checklist', href: '/checklist' },
      { labelKey: 'footer.guide', href: '/airport-guide' },
      { labelKey: 'footer.phrases', href: '/emergency' },
    ],
  },
  {
    titleKey: 'footer.support',
    links: [
      { labelKey: 'footer.khmerSupport', href: 'https://t.me/domnerapp' },
      { labelKey: 'footer.contact', href: 'https://t.me/domnerapp' },
      { labelKey: 'footer.affiliate', href: '/affiliate' },
      { labelKey: 'footer.about', href: '/' },
    ],
  },
];

export function Footer() {
  const { t } = useLang();
  const pathname = usePathname();

  // The Apsara hero is a standalone full-screen page without site chrome.
  if (pathname === '/apsara-hero') return null;

  return (
    <footer className="bg-primary text-white">
      {/* has-tabbar: the fixed phone bar sits over the last row otherwise.
          Two columns on a phone rather than four stacked blocks — stacked, this
          footer ran 1080px on a 390px screen, so every page on the site ended
          with more than a full screen of link list to scroll past. */}
      <div className="has-tabbar mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4 md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <DomerLogo surface="navy" />
            <p className="mt-2 font-display text-[11px] uppercase tracking-[0.28em] text-white/40">
              The Art of the Journey
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">{t('footer.tagline')}</p>
            <div className="mt-5 flex gap-3">
              <a
                href="https://facebook.com"
                aria-label="Domner on Facebook"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Facebook size={16} />
              </a>
              <a
                href="https://t.me/domnerapp"
                aria-label="Domner on Telegram"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Send size={16} />
              </a>
              <a
                href="https://tiktok.com"
                aria-label="Domner on TikTok"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Music2 size={16} />
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.titleKey}>
              <h3 className="mb-3 text-sm font-semibold sm:mb-4 uppercase tracking-widest text-white/50">
                {t(col.titleKey)}
              </h3>
              <ul className="space-y-2 sm:space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.labelKey}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-accent"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:mt-14 items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs sm:pt-8 text-white/50 sm:flex-row">
          <p>© {new Date().getFullYear()} Domner</p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/privacy" className="transition-colors hover:text-white">
              {t('footer.privacy')}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              {t('footer.terms')}
            </Link>
            <Link href="/refunds" className="transition-colors hover:text-white">
              {t('footer.refunds')}
            </Link>
            <p>{t('footer.prices')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
