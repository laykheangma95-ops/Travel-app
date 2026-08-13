'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Contextual notification permission.
//
// §12 of the brief, and the single most important rule about permissions: never
// ask "Allow notifications?" cold. Explain what the traveler gets, in the
// moment it becomes true, and only then hand over to the browser.
//
// So this component takes a `reason` — the thing that just happened — and words
// the offer around it. It renders nothing at all when there is nothing to ask
// for: already subscribed, already denied, unsupported browser, or no VAPID keys
// configured on the server. A prompt that cannot lead anywhere is worse than no
// prompt, because it teaches people to dismiss ours.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Bell, BellOff, Check, X } from 'lucide-react';
import { usePush } from '@/hooks/usePush';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type PermissionReason = 'flight' | 'trip' | 'esim' | 'general';

const COPY: Record<PermissionReason, { title: { en: string; km: string }; body: { en: string; km: string } }> = {
  flight: {
    title: { en: 'Never miss a flight update', km: 'មិនខកខានព័ត៌មានជើងហោះហើរ' },
    body: {
      en: "We'll notify you if your gate, departure time or boarding information changes.",
      km: 'យើងនឹងជូនដំណឹង ប្រសិនបើទ្វារ ម៉ោងចេញ ឬព័ត៌មានឡើងយន្តហោះផ្លាស់ប្តូរ។',
    },
  },
  trip: {
    title: { en: 'Stay ahead of your trip', km: 'រៀបចំមុនដំណើររបស់អ្នក' },
    body: {
      en: "We'll remind you the day before you travel, and tell you when something in your plan moves.",
      km: 'យើងនឹងរំលឹកអ្នកមួយថ្ងៃមុនដំណើរ និងប្រាប់ពេលកម្មវិធីផ្លាស់ប្តូរ។',
    },
  },
  esim: {
    title: { en: 'Know before your data runs out', km: 'ដឹងមុនពេលទិន្នន័យអស់' },
    body: {
      en: "We'll tell you when your eSIM goes live, and again before the data runs low.",
      km: 'យើងនឹងប្រាប់ពេល eSIM ដំណើរការ និងមុនពេលទិន្នន័យតិច។',
    },
  },
  general: {
    title: { en: 'Travel updates, when they matter', km: 'ព័ត៌មានដំណើរ ពេលវាសំខាន់' },
    body: {
      en: 'Gate changes, delays, boarding and low data. Nothing else.',
      km: 'ការផ្លាស់ប្តូរទ្វារ ការពន្យារពេល ការឡើងយន្តហោះ និងទិន្នន័យតិច។ គ្មានអ្វីផ្សេង។',
    },
  },
};

export function PermissionPrompt({
  reason = 'general',
  className,
  /** Renders as a plain block instead of a dismissible card — used on YOU → Notifications. */
  embedded = false,
}: {
  reason?: PermissionReason;
  className?: string;
  embedded?: boolean;
}) {
  const { lang } = useLang();
  const { state, busy, error, enable } = usePush();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && !embedded) return null;

  // Nothing to offer. Only the settings screen says so out loud; everywhere
  // else this component simply is not there.
  if (state === 'checking') return null;
  if (state === 'subscribed' && !embedded) return null;
  if ((state === 'unsupported' || state === 'unconfigured') && !embedded) return null;

  const copy = COPY[reason];

  if (embedded) {
    return (
      <div className={cn('night-card p-5', className)}>
        <EmbeddedState state={state} busy={busy} error={error} onEnable={enable} lang={lang} />
      </div>
    );
  }

  return (
    <div className={cn('night-card relative p-5', className)} role="region" aria-label={copy.title[lang]}>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        aria-label={lang === 'km' ? 'បិទ' : 'Dismiss'}
      >
        <X size={16} aria-hidden="true" />
      </button>

      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-light/30 bg-accent/15 text-gold-light"
        aria-hidden="true"
      >
        <Bell size={16} strokeWidth={2.25} />
      </span>

      <h3 className="mt-3 pr-8 font-display text-xl text-white">{copy.title[lang]}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-white/70">{copy.body[lang]}</p>

      {error && (
        <p className="mt-2 text-sm text-[#FCD34D]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy || state === 'denied'}
          className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn px-4 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-105 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          <Bell size={15} aria-hidden="true" />
          {busy
            ? lang === 'km'
              ? 'កំពុងរៀបចំ…'
              : 'Turning on…'
            : reason === 'flight'
              ? lang === 'km'
                ? 'បើកការជូនដំណឹងជើងហោះហើរ'
                : 'Turn on flight alerts'
              : lang === 'km'
                ? 'បើកការជូនដំណឹង'
                : 'Turn on alerts'}
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-4 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          {lang === 'km' ? 'ពេលក្រោយ' : 'Maybe later'}
        </button>
      </div>

      {state === 'denied' && (
        <p className="mt-3 text-xs leading-relaxed text-white/55">
          {lang === 'km'
            ? 'ការជូនដំណឹងត្រូវបានបិទនៅក្នុងកម្មវិធីរុករករបស់អ្នក។ សូមបើកវាឡើងវិញនៅក្នុងការកំណត់គេហទំព័រ។'
            : 'Notifications are blocked in your browser. You can re-enable them in your site settings.'}
        </p>
      )}
    </div>
  );
}

function EmbeddedState({
  state,
  busy,
  error,
  onEnable,
  lang,
}: {
  state: ReturnType<typeof usePush>['state'];
  busy: boolean;
  error: string | null;
  onEnable: () => Promise<boolean>;
  lang: 'en' | 'km';
}) {
  if (state === 'subscribed') {
    return (
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-success/40 bg-success/15 text-[#6EE7B7]"
          aria-hidden="true"
        >
          <Check size={15} strokeWidth={2.5} />
        </span>
        <div>
          <p className="font-semibold text-white">
            {lang === 'km' ? 'ការជូនដំណឹងបានបើក' : 'Notifications are on'}
          </p>
          <p className="mt-1 text-sm text-white/65">
            {lang === 'km'
              ? 'ឧបករណ៍នេះនឹងទទួលការជូនដំណឹងតាមប្រភេទដែលអ្នកបានជ្រើស។'
              : 'This device will receive the categories you have switched on below.'}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'unsupported' || state === 'unconfigured') {
    return (
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/60"
          aria-hidden="true"
        >
          <BellOff size={15} />
        </span>
        <div>
          <p className="font-semibold text-white">
            {lang === 'km' ? 'ការជូនដំណឹងមិនអាចប្រើបានទេ' : 'Push is not available here'}
          </p>
          <p className="mt-1 text-sm text-white/65">
            {state === 'unsupported'
              ? lang === 'km'
                ? 'នៅលើ iPhone សូមបន្ថែម Domner ទៅអេក្រង់ដើមជាមុន បន្ទាប់មកបើកពីទីនោះ។'
                : 'On iPhone, add Domner to your Home Screen first, then open it from there.'
              : lang === 'km'
                ? 'ការជូនដំណឹងមិនទាន់បានកំណត់នៅលើសឺវើទេ។'
                : 'Push is not configured on this deployment yet.'}
          </p>
          <p className="mt-2 text-sm text-white/65">
            {lang === 'km'
              ? 'ការជូនដំណឹងទាំងអស់នៅតែបង្ហាញក្នុង Domner Updates។'
              : 'Every update still appears in Domner Updates.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="font-semibold text-white">
        {lang === 'km' ? 'បើកការជូនដំណឹងលើឧបករណ៍នេះ' : 'Turn on notifications on this device'}
      </p>
      <p className="mt-1 text-sm text-white/65">
        {lang === 'km'
          ? 'ការជូនដំណឹងបានបើកតែលើឧបករណ៍ដែលអ្នកអនុញ្ញាត។'
          : 'Alerts arrive only on the devices where you allow them.'}
      </p>
      {error && (
        <p className="mt-2 text-sm text-[#FCD34D]" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void onEnable()}
        disabled={busy || state === 'denied'}
        className="liquid-glass-accent liquid-press mt-3 inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn px-4 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-105 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
      >
        <Bell size={15} aria-hidden="true" />
        {busy ? (lang === 'km' ? 'កំពុងរៀបចំ…' : 'Turning on…') : lang === 'km' ? 'បើក' : 'Turn on'}
      </button>
      {state === 'denied' && (
        <p className="mt-3 text-xs leading-relaxed text-white/55">
          {lang === 'km'
            ? 'ការជូនដំណឹងត្រូវបានបិទក្នុងកម្មវិធីរុករក។ សូមបើកឡើងវិញក្នុងការកំណត់គេហទំព័រ។'
            : 'Blocked in your browser. Re-enable Domner in your site settings, then come back.'}
        </p>
      )}
    </div>
  );
}
