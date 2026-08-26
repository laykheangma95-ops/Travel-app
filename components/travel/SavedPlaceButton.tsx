'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SavedPlaceButton — "keep this place", on a canonical place.
//
// NOT SavePlaceButton. That one saves a guide entry onto a TRIP and can ask
// which trip; it is unchanged and still used by the destination guides. This
// one toggles a place in the traveler's own library, has no trip in it, and so
// has no question to ask: one tap saves, one tap unsaves.
//
// WHY A HEART AND NOT A BOOKMARK: the two actions sit near each other in the
// product and must never be mistaken for one another. The trip save keeps the
// bookmark; the library keeps the heart.
//
// GOLD BUDGET (see .claude/skills/ui-ux §2): the saved state uses starlight
// blue, not gold. A list can show twenty of these at once, and twenty gold
// hearts would spend the whole viewport's budget on a state indicator. Gold
// stays rare; this reads as system state, exactly like the tick on the trip
// save.
//
// It renders for everybody without checking who you are first, and turns into a
// sign-in link only if the server says 401 — same reasoning as the trip save:
// the page stays cacheable and adds no request to first paint.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'signIn' }
  | { kind: 'error'; message: string };

interface SavedPlaceButtonProps {
  /** The canonical `places.id`. The only thing this component names. */
  placeId: string;
  /** For the accessible label — every button on a list says the same words. */
  placeName: string;
  /** What the server already told us, so the first paint is not a guess. */
  initialSaved: boolean;
  /** Where sign-in should return to. */
  returnTo: string;
  /**
   * The import this place came from, when the caller has one — e.g. the
   * import "saved" screen hearting a place it just added. Provenance only:
   * omitting it (the default, every other mount of this button) saves with no
   * import attached, exactly as before. The server is the actual boundary —
   * `saved_places_insert_own`'s WITH CHECK and its guard trigger (migration
   * 014) are what refuse an id naming another traveler's import; this prop is
   * never trusted as authorization on its own.
   */
  sourceImportId?: string | null;
  /** Told after a successful toggle, so a list can update its own counts. */
  onChange?: (saved: boolean) => void;
}

export function SavedPlaceButton({
  placeId,
  placeName,
  initialSaved,
  returnTo,
  sourceImportId,
  onChange,
}: SavedPlaceButtonProps) {
  const { t } = useLang();
  const [saved, setSaved] = useState(initialSaved);
  const [state, setState] = useState<ButtonState>({ kind: 'idle' });

  // A request that resolves after the traveler has navigated away must not set
  // state on an unmounted component.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    const next = !saved;
    setState({ kind: 'busy' });

    try {
      // Both verbs are idempotent server-side, so a double tap cannot produce
      // two saves or a half-removed one. The button still disables itself while
      // it waits — not for correctness, but so the label is never lying about
      // what is happening.
      const response = next
        ? await fetch('/api/travel/places/saved', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              sourceImportId ? { placeId, sourceImportId } : { placeId }
            ),
          })
        : await fetch(`/api/travel/places/saved?placeId=${encodeURIComponent(placeId)}`, {
            method: 'DELETE',
            credentials: 'include',
          });

      if (!live.current) return;

      if (response.status === 401) {
        setState({ kind: 'signIn' });
        return;
      }

      if (!response.ok) {
        // Switch on the CODE, never echo the server's message: those are
        // written in English for whoever is on call, and this UI is Khmer-first.
        const payload = await response.json().catch(() => null);
        const code = payload?.error?.code;
        setState({
          kind: 'error',
          message:
            code === 'SERVICE_UNAVAILABLE'
              ? t('v3.save.unavailable')
              : code === 'RATE_LIMITED'
                ? t('v3.save.busy')
                : t('saved.error'),
        });
        return;
      }

      setSaved(next);
      setState({ kind: 'idle' });
      onChange?.(next);
    } catch {
      if (!live.current) return;
      // fetch rejects on a dropped connection, which for this audience is the
      // likeliest failure: a lot of this is used on hotel wifi abroad.
      setState({
        kind: 'error',
        message: navigator.onLine === false ? t('v3.save.offline') : t('saved.error'),
      });
    }
  }, [saved, placeId, sourceImportId, onChange, t]);

  if (state.kind === 'signIn') {
    return (
      <p className="v3-save-row">
        <SignInLink returnTo={returnTo} className="v3-save v3-save-signin">
          <Heart size={15} aria-hidden="true" />
          {t('saved.signIn')}
        </SignInLink>
      </p>
    );
  }

  const busy = state.kind === 'busy';

  return (
    <p className="v3-save-row">
      <button
        type="button"
        className={saved ? 'v3-save v3-save-kept' : 'v3-save'}
        onClick={toggle}
        disabled={busy}
        // The pressed state is what a screen reader reads as "saved", so it has
        // to be the truth rather than the label's paraphrase of it.
        aria-pressed={saved}
        aria-label={`${saved ? t('saved.remove') : t('saved.action')} — ${placeName}`}
      >
        {busy ? (
          <Loader2 size={15} aria-hidden="true" className="v3-save-spin" />
        ) : (
          <Heart
            size={15}
            aria-hidden="true"
            // Filled when kept: the shape carries the state as well as the
            // colour, so it survives a colour-blind reader and a greyscale
            // screenshot.
            fill={saved ? 'currentColor' : 'none'}
          />
        )}
        {busy ? t('saved.working') : saved ? t('saved.kept') : t('saved.action')}
      </button>
      {state.kind === 'error' && (
        <span className="v3-save-error" role="alert">
          {state.message}
        </span>
      )}
    </p>
  );
}
