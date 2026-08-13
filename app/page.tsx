import type { Metadata } from 'next';
import { HomepageV3 } from '@/components/home/v3/HomepageV3';
import { TravelDeck } from '@/components/travel/TravelDeck';
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
  return (
    <>
      {/* Context-aware Home. The deck renders NOTHING for a guest or a traveler
          with nothing on record, so a first-time visitor still gets the globe
          hero as their whole first screen. Once there is a trip, a flight or an
          eSIM, it takes the top — someone boarding in 40 minutes is not here to
          admire a globe. See components/travel/TravelDeck.tsx. */}
      <TravelDeck />
      <HomepageV3 />
    </>
  );
}
