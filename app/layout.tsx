import type { Metadata } from 'next';
import { Manrope, Marcellus, JetBrains_Mono, Noto_Serif_Khmer } from 'next/font/google';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ReferralTracker } from '@/components/layout/ReferralTracker';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { DomerSplash } from '@/components/brand/DomerLoader';
import { TripCopilot } from '@/components/copilot/TripCopilot';
import { LanguageProvider } from '@/lib/i18n';
import { Suspense } from 'react';
import 'leaflet/dist/leaflet.css';
import './globals.css';

// Domer brand type: Marcellus (display/wordmark), Manrope (UI/body),
// Noto Serif Khmer (Khmer script), JetBrains Mono (flight data).
const display = Marcellus({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const khmer = Noto_Serif_Khmer({ subsets: ['khmer'], weight: ['400', '600', '700'], variable: '--font-khmer' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://domnerapp.com'),
  title: {
    default: 'Domer — Travel Confidently. Stay Connected.',
    template: '%s · Domer',
  },
  description:
    "Cambodia's first Khmer-language travel super app. eSIM for 150+ countries, real-time flight alerts, and step-by-step airport guidance — all in Khmer.",
  openGraph: {
    title: 'Domer — Travel Confidently. Stay Connected.',
    description:
      'eSIM for 150+ countries. Real-time flight alerts. Step-by-step airport guidance. All in Khmer.',
    type: 'website',
    siteName: 'Domer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Domer — Travel Confidently. Stay Connected.',
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Domer',
  },
};

export const viewport = {
  themeColor: '#14263F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${khmer.variable}`}>
      <body className="flex min-h-screen flex-col">
        <LanguageProvider>
          <DomerSplash />
          <ServiceWorkerRegister />
          <Suspense fallback={null}>
            <ReferralTracker />
          </Suspense>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <TripCopilot />
        </LanguageProvider>
      </body>
    </html>
  );
}
