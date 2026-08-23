import type { Metadata } from 'next';
import { SharedMapsLinkView, firstUrlIn } from '@/components/travel/SharedMapsLinkView';

export const metadata: Metadata = {
  title: 'Shared link',
  description: 'A place link shared into Domner.',
  robots: { index: false, follow: false },
};

/** A repeated query param arrives as an array; take the first. */
function one(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || null;
}

// The landing point of the manifest's share_target. Android hands a shared
// item over as `url`, `text`, or both — Google Maps in particular puts the
// link inside `text` alongside the place name, so `text` is searched for a
// link when `url` is absent.
export default function SharedMapsLinkPage({
  searchParams,
}: {
  searchParams: { url?: string | string[]; text?: string | string[] };
}) {
  const url = one(searchParams.url);
  const text = one(searchParams.text);
  const sharedLink = url ?? (text ? firstUrlIn(text) : null);

  return <SharedMapsLinkView sharedLink={sharedLink} />;
}
