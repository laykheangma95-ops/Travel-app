'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SavePlaceButton — "Save to my trip", on a destination guide.
//
// The guide is a public, crawlable, cacheable page, and this is the one thing on
// it that needs an account. So the button does NOT check who you are before
// rendering: it renders for everybody, posts on click, and turns into a sign-in
// link only if the server says 401. That keeps the page static, adds no request
// to first paint, and means a crawler sees the same markup a traveler does.
//
// It answers three questions the server can raise, without ever leaving the page:
//   • not signed in        → a SignInLink that comes back here
//   • more than one trip   → an inline picker, no modal and so no focus trap
//   • already on the trip  → says so, rather than silently filing a second copy
//
// GOLD BUDGET (see .claude/skills/ui-ux): the Places fold already spends its gold
// on the hidden-gem badges, and a guide shows up to four of these at once. Four
// gold buttons would wreck the budget, so the control is neutral glass and the
// confirmed state uses starlight blue — the cool accent, which reads as system
// state rather than as something precious.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';

interface TripCandidate {
  id: string;
  title: string;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; tripId: string; tripTitle: string; createdTrip: boolean; alreadySaved: boolean }
  | { kind: 'choose'; candidates: TripCandidate[] }
  | { kind: 'signIn' }
  | { kind: 'error'; message: string };

interface SavePlaceButtonProps {
  /** `destination_places.content_slug` — from the guide's `Place.contentSlug`. */
  contentSlug: string;
  /** Country name, matching `trip_plans.destination`. */
  destination: string;
  /** The place's name, for the button's accessible label. */
  placeName: string;
  /** Where sign-in should return to. */
  returnTo: string;
}

export function SavePlaceButton({
  contentSlug,
  destination,
  placeName,
  returnTo,
}: SavePlaceButtonProps) {
  const { t } = useLang();
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  // A save that resolves after the traveler has navigated away must not call
  // setState on an unmounted component.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const save = useCallback(
    async (tripId?: string) => {
      setState({ kind: 'saving' });
      try {
        const response = await fetch('/api/travel/places/save', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination, contentSlug, ...(tripId ? { tripId } : {}) }),
        });

        if (!live.current) return;

        if (response.status === 401) {
          setState({ kind: 'signIn' });
          return;
        }

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          // Switch on the CODE, never echo `error.message`. Those messages are
          // written in English for the log and for whoever is on call; this UI
          // is Khmer-first, so a raw one would drop a Khmer reader into English
          // at the only moment something has gone wrong.
          const code = payload?.error?.code;
          setState({
            kind: 'error',
            message:
              code === 'SERVICE_UNAVAILABLE'
                ? t('v3.save.unavailable')
                : code === 'RATE_LIMITED'
                  ? t('v3.save.busy')
                  : t('v3.save.error'),
          });
          return;
        }

        if (payload?.status === 'needsChoice') {
          setState({ kind: 'choose', candidates: payload.candidates ?? [] });
          return;
        }

        setState({
          kind: 'saved',
          tripId: payload.tripId,
          tripTitle: payload.tripTitle,
          createdTrip: Boolean(payload.createdTrip),
          alreadySaved: Boolean(payload.alreadySaved),
        });
      } catch {
        if (!live.current) return;
        // fetch() rejects on a dropped connection, which for this audience is
        // the most likely failure: half of this is read on hotel wifi abroad.
        setState({
          kind: 'error',
          message: navigator.onLine === false ? t('v3.save.offline') : t('v3.save.error'),
        });
      }
    },
    [contentSlug, destination, t]
  );

  if (state.kind === 'signIn') {
    return (
      <p className="v3-save-row">
        <SignInLink returnTo={returnTo} className="v3-save v3-save-signin">
          <Bookmark size={15} aria-hidden="true" />
          {t('v3.save.signIn')}
        </SignInLink>
      </p>
    );
  }

  if (state.kind === 'choose') {
    return (
      <div className="v3-save-choose" role="group" aria-label={t('v3.save.chooseTitle')}>
        <p className="v3-save-choose-title">{t('v3.save.chooseTitle')}</p>
        <p className="v3-save-choose-hint">{t('v3.save.chooseHint')}</p>
        <ul className="v3-save-choose-list">
          {state.candidates.map((trip) => (
            <li key={trip.id}>
              <button type="button" className="v3-save v3-save-option" onClick={() => save(trip.id)}>
                {trip.title}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="v3-save-cancel"
          onClick={() => setState({ kind: 'idle' })}
        >
          {t('v3.save.cancel')}
        </button>
      </div>
    );
  }

  if (state.kind === 'saved') {
    const message = state.alreadySaved
      ? t('v3.save.already')
      : state.createdTrip
        ? t('v3.save.created')
        : t('v3.save.saved');

    return (
      // aria-live so a screen reader hears the outcome; the button that
      // announced it has been replaced, so nothing else would say it.
      <p className="v3-save-row v3-save-done" role="status">
        <Check size={15} aria-hidden="true" className="v3-save-tick" />
        <span>{message.replace('{trip}', state.tripTitle)}</span>
        <Link href={`/trips/${state.tripId}`} className="v3-save-link">
          {t('v3.save.view')}
        </Link>
      </p>
    );
  }

  const saving = state.kind === 'saving';

  return (
    <p className="v3-save-row">
      <button
        type="button"
        className="v3-save"
        onClick={() => save()}
        disabled={saving}
        // The visible label is the same on every card in the list, so the
        // accessible name has to carry which place this one saves.
        aria-label={`${t('v3.save.action')} — ${placeName}`}
      >
        {saving ? (
          <Loader2 size={15} aria-hidden="true" className="v3-save-spin" />
        ) : (
          <Bookmark size={15} aria-hidden="true" />
        )}
        {saving ? t('v3.save.saving') : t('v3.save.action')}
      </button>
      {state.kind === 'error' && (
        <span className="v3-save-error" role="alert">
          {state.message}
        </span>
      )}
    </p>
  );
}
