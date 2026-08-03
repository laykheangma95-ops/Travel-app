import type { Metadata } from 'next';
import { HomepageV3 } from '@/components/home/v3/HomepageV3';
import './v3.css';

export const metadata: Metadata = {
  title: 'Domner — Where are you traveling next?',
  description:
    'Khmer-language travel guidance for Cambodian passport holders: entry requirements, money, transport and connectivity for the places Cambodians actually fly. Plus an eSIM, when you need one.',
  openGraph: {
    title: 'Domner — Where are you traveling next?',
    description:
      'Entry requirements for a Cambodian passport, in Khmer. Money, transport, and an eSIM at the end.',
    type: 'website',
    siteName: 'Domner',
  },
};

export default function HomePage() {
  return <HomepageV3 />;
}
