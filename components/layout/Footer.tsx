import Link from 'next/link';
import { Facebook, Send, Music2 } from 'lucide-react';

const columns = [
  {
    title: 'eSIM',
    links: [
      { label: 'Destinations', href: '/esim' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Install guide', href: '/esim/vietnam#install' },
      { label: 'FAQ', href: '/esim/vietnam#faq' },
    ],
  },
  {
    title: 'Travel Tools',
    links: [
      { label: 'Flight Tracker', href: '/flights' },
      { label: 'Am I Ready? Checklist', href: '/checklist' },
      { label: 'Airport Guide', href: '/airport-guide' },
      { label: 'Emergency Phrases', href: '/emergency' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: '24/7 Khmer Support', href: 'https://t.me/domnerapp' },
      { label: 'Contact', href: 'https://t.me/domnerapp' },
      { label: 'Affiliate Program', href: '/affiliate' },
      { label: 'About', href: '/' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <p className="font-display text-xl font-extrabold">
              <span className="text-[#93B4E8]">Domner</span>
              <span className="text-accent">App</span>
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
              Cambodia&apos;s first travel super app. Travel confidently — stay connected, in Khmer.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="https://facebook.com"
                aria-label="Domner App on Facebook"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Facebook size={16} />
              </a>
              <a
                href="https://t.me/domnerapp"
                aria-label="Domner App on Telegram"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Send size={16} />
              </a>
              <a
                href="https://tiktok.com"
                aria-label="Domner App on TikTok"
                className="rounded-full bg-white/10 p-2.5 transition-colors hover:bg-accent"
              >
                <Music2 size={16} />
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/50">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/50 sm:flex-row">
          <p>© 2025 Domner App</p>
          <div className="flex items-center gap-6">
            <Link href="/" className="transition-colors hover:text-white">Privacy Policy</Link>
            <Link href="/" className="transition-colors hover:text-white">Terms</Link>
            <p>All prices in USD</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
