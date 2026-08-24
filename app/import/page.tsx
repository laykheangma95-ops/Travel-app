import type { Metadata } from 'next';
import { ImportPlacesView } from '@/components/travel/ImportPlacesView';

export const metadata: Metadata = {
  title: 'Import places',
  description: 'Paste a TikTok, Instagram, Facebook, YouTube or Google Maps link and save the places in it to your trip.',
  // Personal, and reached with a link in the query string. Nothing here belongs
  // in an index.
  robots: { index: false, follow: false },
};

/** A repeated query param arrives as an array; take the first. */
function one(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || null;
}

/**
 * The importer, and the landing point of the manifest's share_target.
 *
 * A share sheet hands the item over as some combination of `title`, `text` and
 * `url` — and which of the three carries the link differs per app, which is why
 * all of them are joined and handed to the extractor rather than one being
 * picked. TikTok puts the caption in `text` and the link in `url`; Google Maps
 * puts both inside `text`; Instagram sends `text` alone.
 */
export default function ImportPage({
  searchParams,
}: {
  searchParams: {
    url?: string | string[];
    text?: string | string[];
    title?: string | string[];
    trip?: string | string[];
  };
}) {
  const shared = [one(searchParams.title), one(searchParams.text), one(searchParams.url)]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join('\n');

  return <ImportPlacesView initialInput={shared} initialTripId={one(searchParams.trip)} />;
}
