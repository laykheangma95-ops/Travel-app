'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Where an OS share sheet lands when someone picks Domner.
//
// Android's share sheet hands us either a `url` or — more often, and this is
// what Google Maps actually does — a `text` blob with the link buried in it.
// Both are handled; the link is what we are after either way.
//
// WHAT THIS IS NOT, YET: it does not open the "Add a place" sheet on a
// specific trip with the link already in the field. Doing that needs a trip
// chosen first, and a traveler can have none, one or ten. So v1 puts the link
// on their clipboard and sends them to Trips, one paste away from the flow
// that already resolves it. That is a smaller, honest step than guessing which
// trip they meant.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, MapPin } from 'lucide-react';
import { useLang } from '@/lib/i18n';

/** The first http(s) link in a shared text blob, or null. */
export function firstUrlIn(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/);
  return match ? match[0] : null;
}

export function SharedMapsLinkView({ sharedLink }: { sharedLink: string | null }) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    if (!sharedLink) return;
    setCopyFailed(false);
    try {
      // Undefined outside a secure context — the same trap ShareSheet hit.
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(sharedLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="night-canvas has-tabbar relative min-h-screen px-4 py-10">
      <div className="night-stars" aria-hidden="true" />
      <main className="night-card relative mx-auto max-w-md p-6">
        <span className="grid h-11 w-11 place-items-center rounded-card bg-gold-light/12 text-gold-light">
          <MapPin size={20} aria-hidden="true" />
        </span>

        <h1 className="mt-4 font-display text-xl text-white">
          {sharedLink
            ? lang === 'km'
              ? 'បានទទួលតំណរបស់អ្នក'
              : 'We got your link'
            : lang === 'km'
              ? 'គ្មានតំណនៅក្នុងការចែករំលែកនោះទេ'
              : 'No link in that share'}
        </h1>

        {sharedLink ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'ចម្លងវា បន្ទាប់មកបើកដំណើររបស់អ្នក ហើយបិទភ្ជាប់ក្នុង "បន្ថែមទីតាំង" → "ផ្ទាល់ខ្លួន"។'
                : 'Copy it, then open your trip and paste it into “Add a place” → “Custom”.'}
            </p>

            <p className="mt-4 break-all rounded-btn border border-white/12 bg-white/[0.04] px-3.5 py-2.5 font-mono text-xs text-white/75">
              {sharedLink}
            </p>

            <button
              type="button"
              onClick={() => void copy()}
              className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied
                ? lang === 'km'
                  ? 'បានចម្លង'
                  : 'Copied'
                : lang === 'km'
                  ? 'ចម្លងតំណ'
                  : 'Copy the link'}
            </button>

            {copyFailed && (
              <p role="alert" className="mt-2 text-xs text-amber-200">
                {lang === 'km'
                  ? 'ចម្លងមិនបានទេ។ សូមជ្រើស និងចម្លងតំណខាងលើដោយដៃ។'
                  : 'Copying failed. Select the link above and copy it by hand.'}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            {lang === 'km'
              ? 'កម្មវិធីដែលអ្នកចែករំលែកពីនោះ មិនបានផ្ញើតំណមកទេ។ អ្នកនៅតែអាចបិទភ្ជាប់តំណដោយដៃក្នុងដំណើររបស់អ្នក។'
              : 'The app you shared from did not send a link. You can still paste one by hand inside your trip.'}
          </p>
        )}

        <Link
          href="/trips"
          className="mt-3 inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:border-gold-light/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          {lang === 'km' ? 'ជ្រើសដំណើរ' : 'Choose a trip'}
        </Link>

        {/* Stated plainly rather than papered over, the way InstallPrompt
            states the iOS install limitation. */}
        <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/55">
          {lang === 'km'
            ? 'ការចែករំលែកទៅ Domner ដោយផ្ទាល់ពីកម្មវិធីដទៃ ដំណើរការលើ Android/Chrome នៅពេលដំឡើង Domner រួច។ iOS Safari មិនគាំទ្រវាទេ — នៅទីនោះ សូមចម្លងតំណដោយដៃ។'
            : 'Sharing straight into Domner works on Android/Chrome once Domner is installed. iOS Safari does not support share targets — there, copy the link by hand.'}
        </p>
      </main>
    </div>
  );
}
