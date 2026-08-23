'use client';

// TRIPS — the traveler's own journeys, grouped by where they are in time.
//
// Real rows from trip_plans via /api/travel/state. The previous /my-trips screen
// rendered two hardcoded trips ("Bangkok Weekend", "Japan Cherry Blossom") that
// every visitor saw identically, which is the same class of bug the eSIM list
// already had fixed: a demo that reads as data loss.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Compass, Map, Plus, WifiOff } from 'lucide-react';
import type { TripSummary } from '@/lib/travel/state';
import { TripCard } from './TripCard';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';

export function TripsView() {
  const { lang } = useLang();
  const [state, setState] = useState<'loading' | 'guest' | 'offline' | 'ready'>('loading');
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/travel/trips', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) setState('guest');
          return null;
        }
        if (!res.ok) throw new Error('unavailable');
        return res.json();
      })
      .then((body: { trips?: TripSummary[]; activeTripId?: string | null } | null) => {
        if (cancelled || !body) return;
        setTrips(body.trips ?? []);
        setActiveId(body.activeTripId ?? null);
        setState('ready');
      })
      .catch(() => {
        // A failed request used to land here as `ready` with an empty list, so
        // a traveler with no signal was told "No trips yet" — which reads as
        // their trips having been deleted, at the exact moment they most need
        // to trust this screen.
        if (!cancelled) setState('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const today = new Date().toISOString().slice(0, 10);

  const { now, wishlist, upcoming, past } = useMemo(() => {
    const nowList: TripSummary[] = [];
    const wishlistList: TripSummary[] = [];
    const upcomingList: TripSummary[] = [];
    const pastList: TripSummary[] = [];

    for (const trip of trips) {
      // Dates decide first, always. A saved-place trip that has since been
      // given real dates is a trip like any other, so it files under
      // now/upcoming/past and never lands in "Saved for later".
      if (trip.startDate) {
        const end = trip.endDate ?? trip.startDate;
        if (end < today) {
          pastList.push(trip);
        } else if (trip.startDate <= today) {
          nowList.push(trip);
        } else {
          upcomingList.push(trip);
        }
      } else if (trip.isWishlist) {
        wishlistList.push(trip);
      } else {
        // Undated trips are wishes, and a wish is still ahead of you.
        upcomingList.push(trip);
      }
    }

    upcomingList.sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
    pastList.sort((a, b) => (b.endDate ?? b.startDate ?? '').localeCompare(a.endDate ?? a.startDate ?? ''));

    return { now: nowList, wishlist: wishlistList, upcoming: upcomingList, past: pastList };
  }, [trips, today]);

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
              {lang === 'km' ? 'ដំណើរ' : 'Trips'}
            </p>
            <h1 className="mt-1.5 font-display text-3xl text-white sm:text-4xl">
              {lang === 'km' ? 'ដំណើររបស់អ្នក' : 'Your journeys'}
            </h1>
          </div>
          <Link
            href="/trips/new"
            className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-btn px-4 text-sm font-semibold text-primary-deep"
          >
            <Plus size={15} aria-hidden="true" />
            {lang === 'km' ? 'ដំណើរថ្មី' : 'New trip'}
          </Link>
        </header>

        {state === 'guest' ? (
          <div className="night-card mt-8 p-8 text-center">
            <Compass size={22} className="mx-auto text-gold-light" aria-hidden="true" />
            <h2 className="mt-3 font-display text-xl text-white">
              {lang === 'km' ? 'ចូលគណនីដើម្បីរក្សាទុកដំណើរ' : 'Sign in to save your trips'}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'អ្នកអាចរកមើលគោលដៅដោយមិនចាំបាច់មានគណនី។ គណនីត្រូវការតែពេលរក្សាទុក។'
                : 'You can explore without an account. One is only needed to keep a trip and sync it between devices.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <SignInLink
                returnTo="/trips"
                className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
              >
                {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
              </SignInLink>
              <Link
                href="/explore"
                className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:border-gold-light/40"
              >
                {lang === 'km' ? 'ស្វែងរកគោលដៅ' : 'Explore destinations'}
              </Link>
            </div>
          </div>
        ) : state === 'loading' ? (
          <div className="mt-8 space-y-3" aria-busy="true">
            {[0, 1].map((key) => (
              <div key={key} className="h-48 animate-pulse rounded-card border border-white/8 bg-white/[0.03] motion-reduce:animate-none" />
            ))}
          </div>
        ) : state === 'offline' ? (
          <div className="night-card mt-8 p-8 text-center">
            <WifiOff size={22} className="mx-auto text-white/45" aria-hidden="true" />
            <h2 className="mt-3 font-display text-xl text-white">
              {lang === 'km' ? 'មិនអាចទាញយកដំណើររបស់អ្នកបានទេ' : "We couldn't reach your trips"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'ដំណើររបស់អ្នកនៅតែមាន — យើងគ្រាន់តែមិនអាចទាញយកវាឥឡូវនេះទេ។ សូមព្យាយាមម្ដងទៀតពេលមានអ៊ីនធឺណិត។'
                : 'Your trips are still there — we just cannot load them right now. Try again once you have a connection.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setState('loading');
                setAttempt((value) => value + 1);
              }}
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
            </button>
          </div>
        ) : trips.length === 0 ? (
          <div className="night-card mt-8 p-8 text-center">
            <Map size={22} className="mx-auto text-white/45" aria-hidden="true" />
            <h2 className="mt-3 font-display text-xl text-white">
              {lang === 'km' ? 'មិនមានដំណើរនៅឡើយទេ' : 'No trips yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'ចាប់ផ្តើមពីគោលដៅមួយ ហើយ Domner នឹងតាមដានផ្នែកដែលនៅសល់។'
                : "Start with a destination and Domner keeps track of the rest — flight, stay, eSIM and the days in between."}
            </p>
            {/* Outlined, not accent-gold: the header's "New trip" is already the
                one gold CTA in this viewport (ui-ux §5). */}
            <Link
              href="/explore"
              className="mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              {lang === 'km' ? 'ស្វែងរកគោលដៅ' : 'Explore destinations'}
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-9">
            <TripSection
              title={lang === 'km' ? 'កំពុងធ្វើដំណើរ' : 'Right now'}
              trips={now}
              phase="now"
              activeId={activeId}
            />
            <TripSection
              title={lang === 'km' ? 'រក្សាទុកសម្រាប់ពេលក្រោយ' : 'Saved for later'}
              trips={wishlist}
              phase="wishlist"
              activeId={activeId}
            />
            <TripSection
              title={lang === 'km' ? 'ខាងមុខ' : 'Upcoming'}
              trips={upcoming}
              phase="upcoming"
              activeId={activeId}
            />
            <TripSection
              title={lang === 'km' ? 'បានបញ្ចប់' : 'Past'}
              trips={past}
              phase="past"
              activeId={activeId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TripSection({
  title,
  trips,
  phase,
  activeId,
}: {
  title: string;
  trips: TripSummary[];
  phase: 'now' | 'wishlist' | 'upcoming' | 'past';
  activeId: string | null;
}) {
  // TripCard knows three phases; a saved-place trip is simply an undated
  // upcoming one to it, so only the section heading differs.
  const cardPhase = phase === 'wishlist' ? 'upcoming' : phase;
  if (trips.length === 0) return null;
  return (
    <section aria-labelledby={`trips-${phase}`}>
      <h2 id={`trips-${phase}`} className="text-[11px] font-semibold uppercase tracking-widest text-white/45">
        {title}
      </h2>
      <div className="mt-3 space-y-3">
        {trips.map((trip, index) => (
          <TripCard
            key={trip.id}
            trip={trip}
            phase={trip.id === activeId && cardPhase === 'upcoming' ? 'upcoming' : cardPhase}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
