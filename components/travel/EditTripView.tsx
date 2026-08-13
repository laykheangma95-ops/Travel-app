'use client';

// Loads one trip into TripForm for editing.
//
// Reads the same /api/travel/trips list TripsView and TripWorkspace read, rather
// than a dedicated single-trip endpoint: the list is already rate-limited,
// already RLS-scoped, and already the definition of "trips this caller has", so
// a second read path would be a second place for the answer to differ.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Compass, Map } from 'lucide-react';
import type { TripSummary } from '@/lib/travel/state';
import type { TripDraft } from '@/lib/travel/trips';
import { TripForm } from './TripForm';
import { useLang } from '@/lib/i18n';

function toDraft(trip: TripSummary): TripDraft {
  return {
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    interests: trip.interests,
  };
}

export function EditTripView({ tripId }: { tripId: string }) {
  const { lang } = useLang();
  const [status, setStatus] = useState<'loading' | 'guest' | 'missing' | 'ready'>('loading');
  const [draft, setDraft] = useState<TripDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/travel/trips', { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          if (!cancelled) setStatus('guest');
          return null;
        }
        return response.ok ? response.json() : null;
      })
      .then((body: { trips?: TripSummary[] } | null) => {
        if (cancelled || !body) return;
        const found = (body.trips ?? []).find((candidate) => candidate.id === tripId) ?? null;
        setDraft(found ? toDraft(found) : null);
        setStatus(found ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (status === 'ready' && draft) {
    return <TripForm tripId={tripId} initial={draft} />;
  }

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        {status === 'loading' ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-10 w-40 animate-pulse rounded-btn bg-white/[0.04] motion-reduce:animate-none" />
            <div className="h-96 animate-pulse rounded-card border border-white/8 bg-white/[0.03] motion-reduce:animate-none" />
          </div>
        ) : status === 'guest' ? (
          <div className="night-card p-8 text-center">
            <Compass size={22} className="mx-auto text-gold-light" aria-hidden="true" />
            <h1 className="mt-3 font-display text-xl text-white">
              {lang === 'km' ? 'ចូលគណនីដើម្បីកែសម្រួល' : 'Sign in to edit this trip'}
            </h1>
            <Link
              href={`/sign-in?returnTo=/trips/${tripId}/edit`}
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
            </Link>
          </div>
        ) : (
          <div className="night-card p-8 text-center">
            <Map size={22} className="mx-auto text-white/45" aria-hidden="true" />
            <h1 className="mt-3 font-display text-xl text-white">
              {lang === 'km' ? 'រកដំណើរនេះមិនឃើញ' : 'That trip could not be found'}
            </h1>
            <Link
              href="/trips"
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'ដំណើរទាំងអស់' : 'All trips'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
