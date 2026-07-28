'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Facebook, Send, Music2 } from 'lucide-react';
import { DomerLogo } from '@/components/brand/DomerMark';
import { useLang, type DictKey } from '@/lib/i18n';
import { isStandalonePage } from '@/lib/utils';

const columns: { titleKey: DictKey; links: { labelKey: DictKey; href: string }[] }[] = [
  {
    titleKey: 'footer.esim',
    links: [
      { labelKey: 'footer.destinations', href: '/esim' },
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

  // Standalone pages bring their own footer.
  if (isStandalonePage(pathname)) return null;

  return (
    <footer className="bg-primary text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <DomerLogo surface="navy" />
            <p className="mt-2 font-display text-[11px] uppercase tracking-[0.28em] text-white/40">
              The Art of the Journey
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">{t('footer.tagline')}</p>
            <div className="mt-5 flex gap-3">
              <a
                href="https://facebook.com"
                aria-label="Domer on Facebook"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Facebook size={16} />
              </a>
              <a
                href="https://t.me/domnerapp"
                aria-label="Domer on Telegram"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Send size={16} />
              </a>
              <a
                href="https://tiktok.com"
                aria-label="Domer on TikTok"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Music2 size={16} />
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.titleKey}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/50">
                {t(col.titleKey)}
              </h3>
              <ul className="space-y-2.5">
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

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/50 sm:flex-row">
          <p>© 2025 Domner</p>
          <div className="flex items-center gap-6">
            <Link href="/" className="transition-colors hover:text-white">{t('footer.privacy')}</Link>
            <Link href="/" className="transition-colors hover:text-white">{t('footer.terms')}</Link>
            <p>{t('footer.prices')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
