'use client';

// ─────────────────────────────────────────────────────────────────────────────
// "Save from social" — paste a link, and Domner writes it down.
//
// WHAT THIS SCREEN MUST NOT CLAIM. Phase 3 records links; it does not read
// them. So the success state says "We've got your link", never "We found the
// place". The temptation to write the warmer sentence is exactly the thing to
// resist: a traveler told we found something will go looking for it, and there
// is nothing there yet.
//
// NOT ImportPlacesView. That component runs the extraction pipeline for the
// platforms Domner can already read, and it is unchanged. This one accepts a
// link from any supported platform — including Xiaohongshu, which nothing can
// read yet — and queues it.
//
// The button reuses the `.v3-save` control language rather than inventing a
// new one, so the two import surfaces feel like one product.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Link2, Loader2 } from 'lucide-react';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';
import { classifyLink, firstUrlIn, PLATFORM_LABEL } from '@/lib/travel/socialLink';

/** Every refusal the server can name, mapped to one sentence each. */
type Refusal =
  | 'invalid'
  | 'unsupported'
  | 'rateLimited'
  | 'unavailable'
  | 'server';

type IntakeState =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'accepted'; platform: string; alreadyQueued: boolean; reused: boolean }
  | { kind: 'signIn' }
  | { kind: 'refused'; reason: Refusal };

/** Server rejection codes → which sentence the traveler gets. */
const REFUSAL_FOR: Record<string, Refusal> = {
  empty: 'invalid',
  malformed: 'invalid',
  'too-long': 'invalid',
  'unsupported-protocol': 'unsupported',
  'credentials-in-url': 'unsupported',
  // The server does not distinguish these two to the client on purpose —
  // telling a prober which check they tripped is telling them how to probe.
  'blocked-port': 'unsupported',
  'private-host': 'unsupported',
};

export function SocialLinkIntake({ initialUrl = '' }: { initialUrl?: string }) {
  const { t } = useLang();
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<IntakeState>({ kind: 'idle' });

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  /**
   * The platform, named back the moment the link lands. Pure and local — the
   * same classifier the server uses, so the label never contradicts the answer.
   * The browser makes no request of its own here; it only reads the string.
   */
  const detected = useMemo(() => {
    const link = firstUrlIn(url);
    return link ? classifyLink(link) : null;
  }, [url]);

  const submit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setState({ kind: 'validating' });
    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      if (!live.current) return;

      if (response.status === 401) {
        setState({ kind: 'signIn' });
        return;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const code = payload?.error?.code;
        const reason = payload?.error?.details?.reason as string | undefined;
        setState({
          kind: 'refused',
          reason:
            code === 'RATE_LIMITED'
              ? 'rateLimited'
              : code === 'SERVICE_UNAVAILABLE'
                ? 'unavailable'
                : (reason && REFUSAL_FOR[reason]) || 'server',
        });
        return;
      }

      setState({
        kind: 'accepted',
        platform: payload?.platform ?? 'web',
        alreadyQueued: Boolean(payload?.alreadyQueued),
        reused: Boolean(payload?.reused),
      });
    } catch {
      if (!live.current) return;
      setState({
        kind: 'refused',
        reason: navigator.onLine === false ? 'unavailable' : 'server',
      });
    }
  }, [url]);

  if (state.kind === 'signIn') {
    return (
      <div className="night-card rounded-card p-5">
        <h2 className="font-display text-lg text-white">{t('intake.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{t('intake.signInHint')}</p>
        <SignInLink
          returnTo="/import/link"
          className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
        >
          {t('intake.signIn')}
        </SignInLink>
      </div>
    );
  }

  if (state.kind === 'accepted') {
    const label = PLATFORM_LABEL[state.platform as keyof typeof PLATFORM_LABEL];
    return (
      <div className="night-card rounded-card p-5" role="status">
        <p className="flex items-center gap-2 text-white">
          <Check size={16} aria-hidden="true" className="v3-save-tick" />
          {/* "We've got your link" — NOT "we found the place". Phase 3 has not
              read anything, and the copy must not imply otherwise. */}
          <span className="font-display text-lg">{t('intake.received')}</span>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          {state.alreadyQueued || state.reused ? t('intake.already') : t('intake.receivedHint')}
        </p>
        {label && <p className="mt-3 text-xs uppercase tracking-widest text-accent">{label.en}</p>}
        <button
          type="button"
          className="v3-save mt-4"
          onClick={() => {
            setUrl('');
            setState({ kind: 'idle' });
          }}
        >
          {t('intake.another')}
        </button>
      </div>
    );
  }

  const busy = state.kind === 'validating';

  return (
    <div className="night-card rounded-card p-5">
      <h2 className="font-display text-lg text-white">{t('intake.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-white/60">{t('intake.subtitle')}</p>

      <label htmlFor="intake-url" className="sr-only">
        {t('intake.placeholder')}
      </label>
      <input
        id="intake-url"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="mt-4 w-full rounded-btn border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        placeholder={t('intake.placeholder')}
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          if (state.kind === 'refused') setState({ kind: 'idle' });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        disabled={busy}
      />

      {detected && (
        <p className="mt-2 text-xs text-white/50" aria-live="polite">
          {PLATFORM_LABEL[detected.platform]?.en}
        </p>
      )}

      <p className="v3-save-row">
        <button
          type="button"
          className="v3-save"
          onClick={() => void submit()}
          disabled={busy || !url.trim()}
        >
          {busy ? (
            <Loader2 size={15} aria-hidden="true" className="v3-save-spin" />
          ) : (
            <Link2 size={15} aria-hidden="true" />
          )}
          {busy ? t('intake.working') : t('intake.action')}
        </button>
      </p>

      {state.kind === 'refused' && (
        <p className="v3-save-error" role="alert">
          {t(`intake.error.${state.reason}` as Parameters<typeof t>[0])}
        </p>
      )}
    </div>
  );
}
