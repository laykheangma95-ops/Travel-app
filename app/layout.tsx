import type { Metadata } from 'next';
import { Manrope, Marcellus, Noto_Sans_Khmer, Noto_Serif_Khmer } from 'next/font/google';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ReferralTracker } from '@/components/layout/ReferralTracker';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { LiquidTouchController } from '@/components/pwa/LiquidTouchController';
import { DomerSplash } from '@/components/brand/DomerLoader';
import { TripCopilot } from '@/components/copilot/TripCopilot';
import { LanguageProvider, LANG_COOKIE, type Lang } from '@/lib/i18n';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import 'leaflet/dist/leaflet.css';
import './globals.css';

// Domner brand type — two *pairs*, not four unrelated faces:
//
//   display   Marcellus  ↔  Noto Serif Khmer   (editorial, headings)
//   body/UI   Manrope    ↔  Noto Sans Khmer    (interface, running text)
//
// Noto Sans Khmer is new. The design system asked for three families, which was
// a rule written from a Latin-only point of view: previously `body.lang-km`
// swapped the *whole* font, so Latin words and every numeral inside Khmer copy
// rendered in Noto Serif Khmer's Latin — a different design at a different
// metric — and headings silently lost Marcellus altogether. Pairing a sans with
// the sans and a serif with the serif, split by unicode-range in globals.css,
// is what makes Khmer read as a first-class script here rather than a
// substitution. Cost: one extra Khmer-range subset. See design-notes.md.
const display = Marcellus({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
// Weights are deliberately lean: the serif is only ever used at display sizes,
// where 400 is the whole point of the pairing, and the sans carries the two the
// interface actually needs. Six Khmer weight files would have been a lot of
// bytes on a Cambodian mobile connection for weights nothing renders.
const khmerSerif = Noto_Serif_Khmer({
  subsets: ['khmer'],
  weight: ['400'],
  variable: '--font-khmer',
});
const khmerSans = Noto_Sans_Khmer({
  subsets: ['khmer'],
  weight: ['400', '600'],
  variable: '--font-khmer-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://domnerapp.com'),
  title: {
    default: 'Domner — Travel Confidently. Stay Connected.',
    template: '%s · Domner',
  },
  description:
    "Khmer-language travel guidance for Cambodian passport holders: entry requirements, money, transport and connectivity — plus an eSIM, real-time flight alerts and airport guidance.",
  openGraph: {
    title: 'Domner — Travel Confidently. Stay Connected.',
    description:
      'Entry requirements for a Cambodian passport, in Khmer. Plus eSIM, flight alerts and airport guidance.',
    type: 'website',
    siteName: 'Domner',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Domner — Travel Confidently. Stay Connected.',
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Domner',
  },
};

export const viewport = {
  themeColor: '#14263F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the language on the server so the FIRST response already carries the
  // right <html lang> and the right body font. Previously this was applied by a
  // client effect, meaning crawlers and screen readers always saw lang="en"
  // even for a Khmer-speaking visitor.
  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang: Lang = cookieLang === 'km' ? 'km' : 'en';

  return (
    <html
      lang={lang}
      className={`${display.variable} ${body.variable} ${khmerSerif.variable} ${khmerSans.variable}`}
    >
      <body className={`flex min-h-screen flex-col${lang === 'km' ? ' lang-km' : ''}`}>
        <LanguageProvider initialLang={lang}>
          {/* Keyboard skip link — first tab stop, visible only on focus. */}
          <a
            href="#main-content"
            className="sr-only rounded-btn focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-primary-deep focus:px-4 focus:py-2.5 focus:font-semibold focus:text-white focus:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-gold-light"
          >
            Skip to content
          </a>
          <DomerSplash />
          <ServiceWorkerRegister />
          <LiquidTouchController />
          <Suspense fallback={null}>
            <ReferralTracker />
          </Suspense>
          <Navbar />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <TripCopilot />
        </LanguageProvider>
      </body>
    </html>
  );
}
