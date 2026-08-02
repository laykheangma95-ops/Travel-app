import type { Metadata } from 'next';
import { Manrope, Marcellus, Noto_Serif_Khmer } from 'next/font/google';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ReferralTracker } from '@/components/layout/ReferralTracker';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { LiquidTouchController } from '@/components/pwa/LiquidTouchController';
import { DomerSplash } from '@/components/brand/DomerLoader';
import { TripCopilot } from '@/components/copilot/TripCopilot';
import { LanguageProvider } from '@/lib/i18n';
import { Suspense } from 'react';
import 'leaflet/dist/leaflet.css';
import './globals.css';

// Domner brand type — kept to three families: Marcellus (display/wordmark),
// Manrope (UI/body, also flight & order data with tabular numerals — see
// .font-mono in globals.css), Noto Serif Khmer (Khmer script).
const display = Marcellus({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const khmer = Noto_Serif_Khmer({ subsets: ['khmer'], weight: ['400', '600', '700'], variable: '--font-khmer' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://domnerapp.com'),
  title: {
    default: 'Domner — Travel Confidently. Stay Connected.',
    template: '%s · Domner',
  },
  description:
    "Cambodia's first Khmer-language travel super app. eSIM for 150+ countries, real-time flight alerts, and step-by-step airport guidance — all in Khmer.",
  openGraph: {
    title: 'Domner — Travel Confidently. Stay Connected.',
    description:
      'eSIM for 150+ countries. Real-time flight alerts. Step-by-step airport guidance. All in Khmer.',
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
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${khmer.variable}`}>
      <body className="flex min-h-screen flex-col">
        <LanguageProvider>
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
