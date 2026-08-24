import type { Metadata } from 'next';
import { CoverageView } from '@/components/travel/CoverageView';
import { servedCountries } from '@/data/coverage';
import { coveredCities } from '@/data/cities';

// Unlike /trips and /share, this page is public and worth finding: "does my
// eSIM work in X" is the question travelers search for by name, so it is
// indexable and carries the counts in its own description.
export const metadata: Metadata = {
  title: 'eSIM coverage',
  description: `Every country and city a Domner eSIM reaches — ${servedCountries.length} countries and ${coveredCities.length} cities, with the cheapest plan for each.`,
  openGraph: {
    title: 'Where your eSIM works · Domner',
    description: `${servedCountries.length} countries, ${coveredCities.length} cities. Search by city name.`,
    type: 'website',
    siteName: 'Domner',
  },
};

export default function CoveragePage() {
  return <CoverageView />;
}
