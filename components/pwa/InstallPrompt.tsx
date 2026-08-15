'use client';

// ─────────────────────────────────────────────────────────────────────────────
// "Add Domner to your Home Screen" — earned, not begged for.
//
// The brief is explicit (§13): no aggressive DOWNLOAD OUR APP banner. So this
// prompt has three gates, all of which must pass:
//
//   1. VALUE FIRST. It only appears once the traveler has done something worth
//      keeping — bought an eSIM, created a trip, turned on flight alerts. The
//      calling screen declares that by mounting it with a `trigger`.
//   2. ONCE. A dismissal is remembered in localStorage, permanently. "Maybe
//      later" means later, not on the next page load.
//   3. NOT ALREADY INSTALLED. Standalone display mode means we are already on
//      their Home Screen and asking would be absurd.
//
// iOS has no beforeinstallprompt event and no programmatic install, so there the
// prompt shows the Share → Add to Home Screen instruction instead of a button
// that cannot work. That is a browser limitation, not something to paper over.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Share, Sparkles, X } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useDevicePresentation } from '@/components/layout/DevicePresentation';

/** What the traveler just did. Only used to word the offer. */
export type InstallTrigger = 'order' | 'trip' | 'alerts' | 'itinerary';

const DISMISS_KEY = 'domner.install-prompt.dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COPY: Record<InstallTrigger, { en: string; km: string }> = {
  order: {
    en: 'Your eSIM lives here. Keep Domner one tap away while you travel.',
    km: 'eSIM របស់អ្នកនៅទីនេះ។ រក្សា Domner ក្បែរដៃពេលធ្វើដំណើរ។',
  },
  trip: {
    en: 'Your trip is saved. Keep it on your Home Screen and it travels with you.',
    km: 'ដំណើររបស់អ្នកបានរក្សាទុក។ ដាក់វានៅអេក្រង់ដើម ដើម្បីយកទៅជាមួយ។',
  },
  alerts: {
    en: 'Alerts arrive fastest when Domner is on your Home Screen.',
    km: 'ការជូនដំណឹងមកលឿនបំផុត ពេល Domner នៅលើអេក្រង់ដើម។',
  },
  itinerary: {
    en: 'Your itinerary is ready. Add Domner to your Home Screen to open it anywhere.',
    km: 'កម្មវិធីដំណើររួចរាល់។ បន្ថែម Domner ទៅអេក្រង់ដើម ដើម្បីបើកបានគ្រប់ទីកន្លែង។',
  },
};

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt({
  trigger = 'trip',
  className,
}: {
  trigger?: InstallTrigger;
  className?: string;
}) {
  const { lang } = useLang();
  const { isStandalone } = useDevicePresentation();
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone) {
      setVisible(false);
      return;
    }
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Private mode with storage disabled. Showing once per session is the
      // right compromise — still never twice on the same page.
    }

    setIos(isIos());
    // iOS cannot fire beforeinstallprompt, so it becomes visible on the
    // instruction path immediately.
    if (isIos()) {
      setVisible(true);
      return;
    }

    const onPrompt = (event: Event) => {
      // Chrome would otherwise show its own mini-infobar; we want the branded
      // moment instead, so the event is captured and replayed on our button.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [isStandalone]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      /* storage disabled — nothing to remember it with */
    }
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    // Either way this prompt is finished: accepted means installed, dismissed
    // means they answered the browser's dialog and should not be asked twice.
    dismiss();
    if (choice.outcome === 'accepted') setInstallEvent(null);
  }, [installEvent, dismiss]);

  if (!visible) return null;

  return (
    <div
      className={cn('night-card relative p-5', className)}
      role="region"
      aria-label={lang === 'km' ? 'បន្ថែម Domner' : 'Add Domner'}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        aria-label={lang === 'km' ? 'បិទ' : 'Dismiss'}
      >
        <X size={16} aria-hidden="true" />
      </button>

      <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
        {lang === 'km' ? 'យក Domner ទៅជាមួយ?' : 'Want Domner with you?'}
      </p>
      <p className="mt-2 pr-8 text-sm leading-relaxed text-white/80">{COPY[trigger][lang]}</p>

      {ios ? (
        // No API exists to do this for them on iOS. An honest instruction beats
        // a button that silently does nothing.
        <p className="mt-4 flex items-start gap-2 rounded-btn border border-white/10 bg-white/[0.04] p-3 text-sm text-white/75">
          <Share size={16} className="mt-0.5 shrink-0 text-gold-light" aria-hidden="true" />
          <span>
            {lang === 'km'
              ? 'ចុច Share នៅខាងក្រោម បន្ទាប់មកជ្រើស "Add to Home Screen"។'
              : 'Tap Share below, then choose “Add to Home Screen”.'}
          </span>
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void install()}
            className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn px-4 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            <Sparkles size={15} aria-hidden="true" />
            {lang === 'km' ? 'បន្ថែម Domner' : 'Add Domner'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-4 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            {lang === 'km' ? 'ពេលក្រោយ' : 'Maybe later'}
          </button>
        </div>
      )}
    </div>
  );
}
