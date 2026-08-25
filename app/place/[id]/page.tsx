'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /place/[id] — the first traveler-visible surface for the canonical place
// registry (migration 013). Phase 7 wired the importer to attach
// `canonical_place_id`; nothing rendered it. This is the smallest honest
// screen for it: a place's own facts, a save count, and the same heart button
// already used at /you/saved.
//
// AUTHENTICATED-ONLY, BY DECISION. There is no anonymous variant here and none
// is planned yet — `place_stats` itself refuses to answer an unauthenticated
// caller (migration 014's `place_stats_read`), so a signed-out page would have
// nothing true to show for "how many travelers saved this" anyway. Follows the
// exact same shell and signed-out gate as /you/saved rather than inventing a
// second pattern for the same decision.
//
// EVERY FIELD ON THIS PAGE CAME BACK FROM THE SERVER ALREADY FILTERED BY RLS.
// The route behind this page (`GET /api/travel/places/:id`) answers "found" or
// "not found" and nothing in between — a place that exists but is not this
// traveler's to see looks exactly like a place that does not exist. This page
// must not try to be smarter than that response: there is no case here where
// "forbidden" is the right thing to render instead of "not found".
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ShieldQuestion } from 'lucide-react';
import { SignInLink } from '@/components/ui/SignInLink';
import { SavedPlaceButton } from '@/components/travel/SavedPlaceButton';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/hooks/useSession';
import { CATEGORY_LABEL, type ItineraryCategory } from '@/lib/travel/itinerary';

interface PlaceDetail {
  id: string;
  slug: string;
  name: string;
  localName: string | null;
  countryName: string;
  countryCode: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  category: ItineraryCategory;
  subcategory: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  verificationStatus: 'unverified' | 'provider_verified' | 'domner_public' | 'rejected';
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error' }
  | { kind: 'ready'; place: PlaceDetail; saved: boolean; saveCount: number };

function locationLine(place: PlaceDetail): string {
  const parts = [place.district, place.city, place.countryName].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  // district and city can repeat the same word for a small town; a plain
  // dedupe keeps "Siem Reap, Siem Reap, Cambodia" from ever rendering.
  return [...new Set(parts)].join(', ');
}

export default function PlaceDetailPage() {
  const { t, lang } = useLang();
  const { user, loading: sessionLoading } = useSession();
  const params = useParams<{ id: string }>();
  const placeId = params?.id ?? '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (!user || !placeId) return;

    let active = true;
    setState({ kind: 'loading' });

    fetch(`/api/travel/places/${encodeURIComponent(placeId)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) {
          setState({ kind: 'notFound' });
          return;
        }
        if (!response.ok) {
          setState({ kind: 'error' });
          return;
        }
        const body = (await response.json()) as {
          place: PlaceDetail;
          saved: boolean;
          saveCount: number;
        };
        setState({ kind: 'ready', place: body.place, saved: body.saved, saveCount: body.saveCount });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });

    return () => {
      active = false;
    };
  }, [user, placeId]);

  const returnTo = `/place/${placeId}`;

  if (!sessionLoading && !user) {
    return (
      <div className="night-canvas has-tabbar relative min-h-screen">
        <div className="night-stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
          <h1 className="font-display text-2xl text-white">{t('place.signInTitle')}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {t('place.signInSubtitle')}
          </p>
          <SignInLink
            returnTo={returnTo}
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
        {state.kind === 'loading' && (
          <div className="night-card h-48 rounded-card opacity-40" aria-hidden="true" />
        )}

        {state.kind === 'error' && (
          <p className="v3-save-error" role="alert">
            {t('place.loadError')}
          </p>
        )}

        {state.kind === 'notFound' && (
          <div className="night-card mt-2 rounded-card p-6 text-center">
            <ShieldQuestion size={20} aria-hidden="true" className="mx-auto text-white/40" />
            <p className="mt-3 font-display text-lg text-white">{t('place.notFound')}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-white/60">
              {t('place.notFoundHint')}
            </p>
            <Link href="/you/saved" className="v3-save mt-5 inline-flex">
              {t('place.backToSaved')}
            </Link>
          </div>
        )}

        {state.kind === 'ready' && (
          <article>
            <header>
              <p className="text-xs uppercase tracking-widest text-accent">
                {CATEGORY_LABEL[state.place.category]?.[lang] ?? state.place.category}
              </p>
              <h1 className="mt-1 font-display text-3xl text-white">{state.place.name}</h1>
              {state.place.localName && (
                <p className="mt-1 text-base text-white/60">{state.place.localName}</p>
              )}
              {locationLine(state.place) && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-white/65">
                  <MapPin size={14} aria-hidden="true" className="flex-none" />
                  <span>{locationLine(state.place)}</span>
                </p>
              )}
            </header>

            <div className="night-card mt-6 space-y-3 rounded-card p-5">
              {state.place.address && (
                <p className="text-sm leading-relaxed text-white/70">{state.place.address}</p>
              )}
              {state.place.website && (
                <p className="truncate text-sm">
                  <a
                    href={state.place.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent underline underline-offset-2"
                  >
                    {state.place.website}
                  </a>
                </p>
              )}
              {state.place.phone && (
                <p className="text-sm text-white/70">{state.place.phone}</p>
              )}
              {state.place.verificationStatus === 'unverified' && (
                <p className="text-xs text-white/45">{t('place.unverified')}</p>
              )}
            </div>

            <p className="mt-5 text-sm text-white/55" role="status">
              {state.saveCount === 0
                ? t('place.saveCount.zero')
                : state.saveCount === 1
                  ? t('place.saveCount.one')
                  : t('place.saveCount.many').replace('{n}', String(state.saveCount))}
            </p>

            <div className="mt-4">
              <SavedPlaceButton
                placeId={state.place.id}
                placeName={state.place.name}
                initialSaved={state.saved}
                returnTo={returnTo}
                onChange={(saved) =>
                  setState((current) =>
                    current.kind === 'ready'
                      ? {
                          ...current,
                          saved,
                          saveCount: Math.max(current.saveCount + (saved ? 1 : -1), 0),
                        }
                      : current
                  )
                }
              />
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
