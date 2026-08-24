import { redirect } from 'next/navigation';

/**
 * The OLD share-target address. Kept, and forwarding.
 *
 * The manifest now points share_target at /import, but a traveler who installed
 * Domner before that still has the old manifest on their phone — an installed
 * PWA does not re-read it on demand — so their share sheet keeps landing here
 * for as long as that install lives. Deleting this route would break sharing
 * for exactly the people who had already set it up.
 *
 * What used to render here was a page that put the link on the clipboard and
 * told the traveler to go and paste it into their trip themselves. The importer
 * does that whole job now, so this hands the shared item straight over rather
 * than restating a workaround that is no longer needed.
 */
export default function SharedMapsLinkPage({
  searchParams,
}: {
  searchParams: { url?: string | string[]; text?: string | string[]; title?: string | string[] };
}) {
  const query = new URLSearchParams();
  for (const key of ['title', 'text', 'url'] as const) {
    const value = searchParams[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single?.trim()) query.set(key, single);
  }

  const suffix = query.toString();
  redirect(suffix ? `/import?${suffix}` : '/import');
}
