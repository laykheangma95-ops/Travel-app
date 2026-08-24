'use client';

// ─────────────────────────────────────────────────────────────────────────────
// YOU → Saved places. The traveler's library.
//
// WHY THIS PAGE EXISTS: Phase 2 gives a save somewhere to live that is not a
// trip. Without a screen that lists them, "saved independently of a trip" is a
// table nobody can see. This is the smallest honest surface for it — a list, a
// country filter, and a way to remove.
//
// It is NOT a redesign of anything. It follows the same shell as
// /you/notifications: night canvas, stars, the signed-out state offering a
// SignInLink back to here.
//
// ONE REQUEST FOR THE WHOLE SCREEN. The list arrives with `saved: true` already
// true for every row by definition, and each card's save count comes from the
// maintained counter in the same payload — no per-card query, which is the N+1
// this phase was told to avoid.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, MapPin } from 'lucide-react';
import { SignInLink } from '@/components/ui/SignInLink';
import { SavedPlaceButton } from '@/components/travel/SavedPlaceButton';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/hooks/useSession';
import { CATEGORY_LABEL, type ItineraryCategory } from '@/lib/travel/itinerary';

interface SavedPlaceRow {
  savedId: string;
  placeId: string;
  name: string;
  localName: string | null;
  countryName: string;
  city: string | null;
  category: ItineraryCategory;
  address: string | null;
  saveCount: number;
}

interface Destination {
  destination: string;
  count: number;
}

export default function SavedPlacesPage() {
  const { t, lang } = useLang();
  const { user, loading: sessionLoading } = useSession();

  const [places, setPlaces] = useState<SavedPlaceRow[] | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (destination: string | null) => {
      setError(null);
      try {
        const query = destination ? `?destination=${encodeURIComponent(destination)}` : '';
        const response = await fetch(`/api/travel/places/saved${query}`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('load failed');
        const body = (await response.json()) as {
          places?: SavedPlaceRow[];
          destinations?: Destination[];
        };
        setPlaces(body.places ?? []);
        // The country list is deliberately NOT refreshed while a filter is
        // applied: it is the set of countries the traveler has saves in, and
        // narrowing the list must not narrow the way back out of it.
        if (!destination) setDestinations(body.destinations ?? []);
      } catch {
        setPlaces([]);
        setError(t('saved.loadError'));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!user) return;
    void load(filter);
  }, [user, filter, load]);

  if (!sessionLoading && !user) {
    return (
      <div className="night-canvas has-tabbar relative min-h-screen">
        <div className="night-stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
          <h1 className="font-display text-2xl text-white">{t('saved.title')}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {t('saved.subtitle')}
          </p>
          <SignInLink
            returnTo="/you/saved"
            className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
          >
            {t('saved.signIn')}
          </SignInLink>
        </div>
      </div>
    );
  }

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <main className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-accent">{t('saved.all')}</p>
          <h1 className="mt-1 font-display text-3xl text-white">{t('saved.title')}</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
            {t('saved.subtitle')}
          </p>
        </header>

        {destinations.length > 1 && (
          <div
            className="mt-6 flex flex-wrap gap-2"
            role="group"
            aria-label={t('saved.title')}
          >
            <button
              type="button"
              className={filter === null ? 'v3-save v3-save-kept' : 'v3-save'}
              aria-pressed={filter === null}
              onClick={() => setFilter(null)}
            >
              {t('saved.all')}
            </button>
            {destinations.map((entry) => (
              <button
                key={entry.destination}
                type="button"
                className={filter === entry.destination ? 'v3-save v3-save-kept' : 'v3-save'}
                aria-pressed={filter === entry.destination}
                onClick={() => setFilter(entry.destination)}
              >
                {entry.destination}
                <span className="text-white/50"> · {entry.count}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="v3-save-error mt-6" role="alert">
            {error}
          </p>
        )}

        {places === null ? (
          // A calm skeleton rather than a spinner: the shape of what is coming
          // is more reassuring than a rotating thing, and it does not move.
          <ul className="mt-6 space-y-3" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <li key={row} className="night-card h-24 rounded-card opacity-40" />
            ))}
          </ul>
        ) : places.length === 0 ? (
          <div className="night-card mt-8 rounded-card p-6 text-center">
            <Heart size={20} aria-hidden="true" className="mx-auto text-white/40" />
            <p className="mt-3 font-display text-lg text-white">{t('saved.empty')}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-white/60">
              {t('saved.emptyHint')}
            </p>
            <Link
              href="/explore"
              className="v3-save mt-5 inline-flex"
            >
              {lang === 'km' ? 'រុករក' : 'Explore'}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm text-white/55" role="status">
              {t('saved.count').replace('{n}', String(places.length))}
            </p>
            <ul className="mt-3 space-y-3">
              {places.map((place) => (
                <li key={place.savedId} className="night-card rounded-card p-4">
                  <h2 className="font-display text-lg text-white">{place.name}</h2>
                  {place.localName && (
                    <p className="mt-0.5 text-sm text-white/55">{place.localName}</p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-white/65">
                    <MapPin size={13} aria-hidden="true" className="flex-none" />
                    <span>
                      {place.city ? `${place.city}, ${place.countryName}` : place.countryName}
                      {' · '}
                      {CATEGORY_LABEL[place.category][lang]}
                    </span>
                  </p>
                  {place.address && (
                    <p className="mt-1 text-xs leading-relaxed text-white/45">{place.address}</p>
                  )}
                  <SavedPlaceButton
                    placeId={place.placeId}
                    placeName={place.name}
                    initialSaved
                    returnTo="/you/saved"
                    // Removing from this screen takes the row out of the list —
                    // leaving a card that says "Save" in a list of saved places
                    // would be a screen contradicting itself.
                    onChange={(stillSaved) => {
                      if (!stillSaved) {
                        setPlaces((current) =>
                          (current ?? []).filter((row) => row.savedId !== place.savedId)
                        );
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
