'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The Travel Deck — the personalised band that turns Home into a companion.
//
// WHY IT SITS ABOVE THE HERO RATHER THAN REPLACING IT:
//   The globe hero is the site's signature and its whole first impression, and
//   a brand-new visitor should still get it. So this component renders NOTHING
//   until the traveler has something to be personalised about — no trip, no
//   flight, no eSIM means no deck, and the homepage is exactly what it was.
//   Once they do, the deck takes the top of the screen, because a person with a
//   flight boarding in 40 minutes is not there to admire a globe.
//
// It fetches its own state after mount rather than being server-rendered, for
// two reasons: the homepage stays statically cacheable for everyone, and a slow
// personalisation query can never delay the first paint.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell } from 'lucide-react';
import { STATE_GREETING, type TravelSnapshot } from '@/lib/travel/state';
import { insightFor } from '@/lib/travel/insights';
import { FlightCapsule, ESIMCapsule, WeatherCapsule } from './capsules';
import { TravelCapsule } from './TravelCapsule';
import { TripProgress } from './TripProgress';
import { AIInsight } from './AIInsight';
import { StatusBadge } from './StatusBadge';
import { useLang } from '@/lib/i18n';

interface StateResponse {
  signedIn: boolean;
  displayName?: string | null;
  snapshot: TravelSnapshot | null;
}

interface LiveWeatherResponse {
  weather: {
    temperatureC: number;
    code: number;
    description?: { en: string; km: string };
  } | null;
}

/** WMO codes 51–67 and 80–99 are drizzle, rain and storms. */
function isWet(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
}

export function TravelDeck() {
  const { lang } = useLang();
  const [data, setData] = useState<StateResponse | null>(null);
  const [weather, setWeather] = useState<LiveWeatherResponse['weather']>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/travel/state', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      // ok() in lib/http.ts spreads the payload flat — there is no `data`
      // envelope to unwrap.
      .then((body: StateResponse | null) => {
        if (!cancelled) setData(body ?? null);
      })
      // A failed personalisation fetch is not an error state worth showing.
      // The homepage below is complete on its own.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = data?.snapshot ?? null;
  const trip = snapshot?.activeTrip ?? null;
  const slug = trip?.destinationSlug ?? null;
  const wantsWeather = snapshot?.state === 'traveling' || snapshot?.state === 'at_airport';

  useEffect(() => {
    if (!slug || !wantsWeather) return;
    let cancelled = false;
    fetch(`/api/destination/${slug}/live`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: LiveWeatherResponse | null) => {
        if (!cancelled && body?.weather) setWeather(body.weather);
      })
      // Not every destination has a guide with coordinates yet, so a 404 here is
      // expected and simply means no weather capsule.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, wantsWeather]);

  // Guests, and travelers with nothing on record, see the homepage untouched.
  if (!snapshot || snapshot.state === 'new_user') return null;

  const greeting = STATE_GREETING[snapshot.state][lang];
  const insight = insightFor(snapshot, lang);
  const days = snapshot.daysUntilStart;

  const subtitle = (() => {
    if (snapshot.state === 'at_airport') {
      return lang === 'km' ? 'ថ្ងៃធ្វើដំណើរ' : 'Travel day';
    }
    if (snapshot.state === 'traveling' && trip) return trip.destination;
    if (days !== null && days > 0) {
      return lang === 'km'
        ? `នៅសល់ ${days} ថ្ងៃ`
        : `${days} ${days === 1 ? 'day' : 'days'} to go`;
    }
    if (snapshot.daysSinceEnd !== null) {
      return lang === 'km' ? 'ដំណើរបានបញ្ចប់' : 'Trip complete';
    }
    return null;
  })();

  let index = 0;
  const nextIndex = () => index++;

  return (
    <section
      className="travel-deck night-canvas relative border-b border-white/5 px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-8"
      aria-label={lang === 'km' ? 'ដំណើររបស់អ្នក' : 'Your journey'}
    >
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-2xl lg:max-w-5xl">
        {/* Header: who, where, and one way into the inbox. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
              {lang === 'km' ? 'ដំណើររបស់អ្នក' : 'Your journey'}
            </p>
            <h2 className="mt-1.5 font-display text-3xl leading-tight text-white sm:text-4xl">
              {greeting}
              {data?.displayName && snapshot.state === 'traveling' ? `, ${data.displayName}` : ''}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-white/65">{subtitle}</p>}
          </div>

          <Link
            href="/updates"
            className="flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/75 transition-colors duration-200 ease-smooth hover:border-gold-light/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            aria-label={lang === 'km' ? 'ព័ត៌មានថ្មី' : 'Domner Updates'}
          >
            <Bell size={17} aria-hidden="true" />
          </Link>
        </div>

        {/* The capsules, most present thing first. */}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {snapshot.activeFlight && (
            <FlightCapsule
              flightNumber={snapshot.activeFlight.flightNumber}
              destination={trip?.destination ?? snapshot.activeFlight.arrivalAirport}
              date={snapshot.activeFlight.date}
              // Deliberately 'scheduled': the snapshot knows which flight is
              // next, not whether it is delayed. Live status lives behind
              // /api/flights and the flight page fetches it — a capsule that
              // guessed "On time" would be worse than one that says the date.
              status="scheduled"
              index={nextIndex()}
            />
          )}

          {snapshot.activeEsim ? (
            <ESIMCapsule
              country={snapshot.activeEsim.country}
              planName={snapshot.activeEsim.planName}
              orderNumber={snapshot.activeEsim.orderNumber}
              daysLeft={null}
              state={snapshot.activeEsim.fulfilledAt ? 'active' : 'ready'}
              index={nextIndex()}
            />
          ) : (
            trip && (
              <ESIMCapsule country={trip.destination} state="missing" index={nextIndex()} />
            )
          )}

          {weather && trip && (
            <WeatherCapsule
              place={trip.destination}
              temperatureC={weather.temperatureC}
              description={weather.description?.[lang] ?? null}
              wet={isWet(weather.code)}
              href={slug ? `/destination/${slug}` : undefined}
              index={nextIndex()}
            />
          )}

          {snapshot.state === 'post_trip' && trip && (
            <TravelCapsule
              eyebrow={lang === 'km' ? 'ការចងចាំ' : 'Memories'}
              headline={
                lang === 'km' ? `${trip.destination} — បន្ថែមរូបភាព` : `Add your ${trip.destination} photos`
              }
              detail={lang === 'km' ? 'មុនពេលអ្នកបំភ្លេចព័ត៌មានលម្អិត' : 'Before the details fade'}
              tone="quiet"
              href={`/trips/${trip.id}/memories`}
              index={nextIndex()}
            />
          )}
        </div>

        {/* The trip itself: name, dates, and the five steps. */}
        {trip && snapshot.state !== 'post_trip' && (
          <div className="night-card deck-item mt-3 p-5" style={{ '--deck-index': nextIndex() } as React.CSSProperties}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                  {lang === 'km' ? 'ដំណើរបច្ចុប្បន្ន' : 'Current trip'}
                </p>
                <h3 className="mt-1 truncate font-display text-xl text-white">
                  {trip.flag ? `${trip.flag} ` : ''}
                  {trip.title}
                </h3>
              </div>
              {snapshot.missing.length === 0 && (
                <StatusBadge tone="success">{lang === 'km' ? 'រួចរាល់' : 'Ready'}</StatusBadge>
              )}
            </div>

            <TripProgress readiness={trip.readiness} tripId={trip.id} className="mt-4" />

            <Link
              href={`/trips/${trip.id}`}
              className="mt-4 inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-semibold text-gold-bright hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              {lang === 'km' ? 'បើកកន្លែងធ្វើការដំណើរ' : 'Open trip workspace'}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}

        {insight && <AIInsight message={insight.message} action={insight.action} className="mt-3" />}
      </div>
    </section>
  );
}
