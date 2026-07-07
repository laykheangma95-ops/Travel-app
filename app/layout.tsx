import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Noto_Sans_Khmer } from 'next/font/google';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ReferralTracker } from '@/components/layout/ReferralTracker';
import { LanguageProvider } from '@/lib/i18n';
import { Suspense } from 'react';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const khmer = Noto_Sans_Khmer({ subsets: ['khmer'], weight: ['400', '600'], variable: '--font-khmer' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://domnerapp.com'),
  title: {
    default: 'Domner App — Travel Confidently. Stay Connected.',
    template: '%s · Domner App',
  },
  description:
    "Cambodia's first Khmer-language travel super app. eSIM for 150+ countries, real-time flight alerts, and step-by-step airport guidance — all in Khmer.",
  openGraph: {
    title: 'Domner App — Travel Confidently. Stay Connected.',
    description:
      'eSIM for 150+ countries. Real-time flight alerts. Step-by-step airport guidance. All in Khmer.',
    type: 'website',
    siteName: 'Domner App',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Domner App — Travel Confidently. Stay Connected.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${khmer.variable}`}>
      <body className="flex min-h-screen flex-col">
        <LanguageProvider>
          <Suspense fallback={null}>
            <ReferralTracker />
          </Suspense>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
