import type { Metadata } from 'next';
import { HomeContent } from '@/components/home/HomeContent';

export const metadata: Metadata = {
  title: 'Domer — Travel Confidently. Stay Connected.',
};

export default function HomePage() {
  return <HomeContent />;
}
