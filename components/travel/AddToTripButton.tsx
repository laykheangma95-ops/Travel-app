'use client';

// ─────────────────────────────────────────────────────────────────────────────
// AddToTripButton — "put this canonical place on a trip", shared by
// /place/[id] and /you/saved so the orchestration and the states it can be in
// are written once (Phase 10 owner brief, §8: "do not duplicate the
// orchestration logic separately across two pages").
//
// NOT SavedPlaceButton. That one toggles the traveler's library (a heart, no
// trip involved). This one is the trip bookmark's sibling for a canonical
// place — same shape as SavePlaceButton, same v3-save.* styling, talking to
// POST /api/travel/places/:id/add-to-trip instead of .../places/save.
//
// It renders for everybody without checking who is signed in first — both of
// today's call sites happen to be authenticated-only pages already, but the
// button stays self-contained and turns into a sign-in link on a 401 the same
// way SavePlaceButton and SavedPlaceButton do, so it degrades correctly even
// if a session has quietly expired mid-visit.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, MapPinPlus } from 'lucide-react';
import Link from 'next/link';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';

interface TripCandidate {
  id: string;
  title: string;
}

type AddState =
  | { kind: 'idle' }
  | { kind: 'adding' }
  | { kind: 'added'; tripId: string; tripTitle: string; createdTrip: boolean; alreadyAdded: boolean }
  | { kind: 'choose'; candidates: TripCandidate[] }
  | { kind: 'signIn' }
  | { kind: 'error'; message: string };

interface AddToTripButtonProps {
  /** The canonical `places.id` — the only thing this component names. */
  placeId: string;
  /** For the accessible label — every button on a list says the same words. */
  placeName: string;
  /** Where sign-in should return to. */
  returnTo: string;
}

export function AddToTripButton({ placeId, placeName, returnTo }: AddToTripButtonProps) {
  const { t } = useLang();
  const [state, setState] = useState<AddState>({ kind: 'idle' });

  // A request that resolves after the traveler has navigated away must not set
  // state on an unmounted component.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const add = useCallback(
    async (tripId?: string) => {
      setState({ kind: 'adding' });
      try {
        const response = await fetch(`/api/travel/places/${encodeURIComponent(placeId)}/add-to-trip`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tripId ? { tripId } : {}),
        });

        if (!live.current) return;

        if (response.status === 401) {
          setState({ kind: 'signIn' });
          return;
        }

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          // Switch on the CODE, never echo `error.message` — that text is
          // written in English for the log, and this UI is Khmer-first.
          const code = payload?.error?.code;
          setState({
            kind: 'error',
            message:
              code === 'SERVICE_UNAVAILABLE'
                ? t('v3.save.unavailable')
                : code === 'RATE_LIMITED'
                  ? t('v3.save.busy')
                  : code === 'NOT_FOUND'
                    ? t('addToTrip.notFound')
                    : t('addToTrip.error'),
          });
          return;
        }

        if (payload?.status === 'needsChoice') {
          setState({ kind: 'choose', candidates: payload.candidates ?? [] });
          return;
        }

        setState({
          kind: 'added',
          tripId: payload.tripId,
          tripTitle: payload.tripTitle,
          createdTrip: Boolean(payload.createdTrip),
          alreadyAdded: Boolean(payload.alreadyAdded),
        });
      } catch {
        if (!live.current) return;
        // fetch() rejects on a dropped connection, which for this audience is
        // the most likely failure: half of this is read on hotel wifi abroad.
        setState({
          kind: 'error',
          message: navigator.onLine === false ? t('v3.save.offline') : t('addToTrip.error'),
        });
      }
    },
    [placeId, t]
  );

  if (state.kind === 'signIn') {
    return (
      <p className="v3-save-row">
        <SignInLink returnTo={returnTo} className="v3-save v3-save-signin">
          <MapPinPlus size={15} aria-hidden="true" />
          {t('addToTrip.signIn')}
        </SignInLink>
      </p>
    );
  }

  if (state.kind === 'choose') {
    return (
      <div className="v3-save-choose" role="group" aria-label={t('addToTrip.chooseTitle')}>
        <p className="v3-save-choose-title">{t('addToTrip.chooseTitle')}</p>
        <p className="v3-save-choose-hint">{t('addToTrip.chooseHint')}</p>
        <ul className="v3-save-choose-list">
          {state.candidates.map((trip) => (
            <li key={trip.id}>
              <button type="button" className="v3-save v3-save-option" onClick={() => add(trip.id)}>
                {trip.title}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="v3-save-cancel" onClick={() => setState({ kind: 'idle' })}>
          {t('v3.save.cancel')}
        </button>
      </div>
    );
  }

  if (state.kind === 'added') {
    const message = state.alreadyAdded
      ? t('addToTrip.already')
      : state.createdTrip
        ? t('addToTrip.created')
        : t('addToTrip.added');

    return (
      // aria-live so a screen reader hears the outcome; the button that
      // announced it has been replaced, so nothing else would say it.
      <p className="v3-save-row v3-save-done" role="status">
        <Check size={15} aria-hidden="true" className="v3-save-tick" />
        <span>{message.replace('{trip}', state.tripTitle)}</span>
        <Link href={`/trips/${state.tripId}/itinerary`} className="v3-save-link">
          {t('addToTrip.view')}
        </Link>
      </p>
    );
  }

  const adding = state.kind === 'adding';

  return (
    <p className="v3-save-row">
      <button
        type="button"
        className="v3-save"
        onClick={() => add()}
        disabled={adding}
        // The visible label is the same on every card in a list, so the
        // accessible name has to carry which place this one is for.
        aria-label={`${t('addToTrip.action')} — ${placeName}`}
      >
        {adding ? (
          <Loader2 size={15} aria-hidden="true" className="v3-save-spin" />
        ) : (
          <MapPinPlus size={15} aria-hidden="true" />
        )}
        {adding ? t('addToTrip.adding') : t('addToTrip.action')}
      </button>
      {state.kind === 'error' && (
        <span className="v3-save-error" role="alert">
          {state.message}
        </span>
      )}
    </p>
  );
}
