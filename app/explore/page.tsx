import type { Metadata } from 'next';
import { ExploreView } from '@/components/travel/ExploreView';
// The bespoke destination artwork positions itself with .v3-scene-band, which
// lives in the homepage stylesheet. Importing it here rather than copying the
// rule keeps one definition of how that drawing sits.
import '../v3.css';

export const metadata: Metadata = {
  title: 'Explore',
  description:
    'Where Cambodians actually fly — written up properly. Entry requirements, real prices, transport and connectivity for every destination.',
  openGraph: {
    title: 'Explore · Domner',
    description: 'Where Cambodians actually fly, written up properly.',
    type: 'website',
    siteName: 'Domner',
  },
};

export default function ExplorePage() {
  return <ExploreView />;
}
