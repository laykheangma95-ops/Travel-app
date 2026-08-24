import type { Metadata } from 'next';
import { SocialLinkIntake } from '@/components/travel/SocialLinkIntake';

export const metadata: Metadata = {
  title: 'Save a link',
  description: 'Paste a TikTok, Instagram, YouTube, Xiaohongshu or travel link and Domner will keep it.',
  // Personal, and reached with a link in the query string. Nothing here belongs
  // in an index — same reasoning as /import.
  robots: { index: false, follow: false },
};

/** A repeated query param arrives as an array; take the first. */
function one(value: string | string[] | undefined): string {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() ?? '';
}

/**
 * The intake surface.
 *
 * WHY IT IS A SEPARATE ROUTE FROM /import: /import runs the extraction pipeline
 * and returns places, and it works today for the platforms Domner can read.
 * Replacing it with an intake that only records a link would be a downgrade of
 * a live feature. This is the front door for the platforms extraction cannot
 * reach yet — Xiaohongshu above all — and folding the two together is a
 * decision for the phase that builds the connector layer, when there is
 * something to fold them around.
 */
export default function ImportLinkPage({
  searchParams,
}: {
  searchParams: { url?: string | string[]; text?: string | string[] };
}) {
  const initial = one(searchParams.url) || one(searchParams.text);

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <main className="relative mx-auto max-w-xl px-4 py-10 sm:px-6">
        <p className="text-xs uppercase tracking-widest text-accent">Domner</p>
        <h1 className="mt-1 font-display text-3xl text-white">Save from social</h1>
        <div className="mt-6">
          <SocialLinkIntake initialUrl={initial} />
        </div>
      </main>
    </div>
  );
}
