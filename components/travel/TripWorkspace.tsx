'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The trip workspace — one screen for one journey.
//
// §16: the traveler should not have to jump between unrelated sections. So every
// part of a trip is anchored here — flight, stay, eSIM, places, itinerary,
// memories — and each section is either the real thing or an honest, actionable
// gap. The section ids match the deep links the notification catalogue emits
// (#stay, #places, #itinerary, #weather), so a push notification lands on the
// exact block it is about.
//
// What this screen does NOT do is invent data. Where there is no bookings table
// yet (stay), it says so and offers the step that would fill it, rather than
// rendering a plausible hotel card.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BedDouble,
  Camera,
  CloudSun,
  ListChecks,
  MapPin,
  Pencil,
  Plane,
  Signal,
} from 'lucide-react';
import type { TripSummary } from '@/lib/travel/state';
import { readinessPercent } from '@/lib/travel/state';
import { TripProgress } from './TripProgress';
import { WeatherCapsule } from './capsules';
import { StatusBadge } from './StatusBadge';
import { SignInLink } from '@/components/ui/SignInLink';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { PermissionPrompt } from '@/components/notifications/PermissionPrompt';
import { useLang } from '@/lib/i18n';

interface Weather {
  temperatureC: number;
  code: number;
  description?: { en: string; km: string };
}

function isWet(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
}

export function TripWorkspace({ tripId }: { tripId: string }) {
  const { lang } = useLang();
  const [status, setStatus] = useState<'loading' | 'guest' | 'missing' | 'ready'>('loading');
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/travel/trips', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) setStatus('guest');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((body: { trips?: TripSummary[] } | null) => {
        if (cancelled || !body) return;
        const found = (body.trips ?? []).find((candidate) => candidate.id === tripId) ?? null;
        setTrip(found);
        setStatus(found ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const slug = trip?.destinationSlug ?? null;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/destination/${slug}/live`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { weather?: Weather | null } | null) => {
        if (!cancelled && body?.weather) setWeather(body.weather);
      })
      // Not every destination has a written guide with coordinates, so a 404
      // here simply means no weather section.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const dates = useMemo(() => {
    if (!trip?.startDate) return lang === 'km' ? 'មិនទាន់កំណត់ថ្ងៃ' : 'Dates not set';
    const locale = lang === 'km' ? 'km-KH' : 'en-GB';
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
    const from = new Date(`${trip.startDate}T00:00:00Z`).toLocaleDateString(locale, options);
    if (!trip.endDate || trip.endDate === trip.startDate) return from;
    const to = new Date(`${trip.endDate}T00:00:00Z`).toLocaleDateString(locale, options);
    return `${from} → ${to}`;
  }, [trip, lang]);

  if (status === 'loading') {
    return (
      <Shell>
        <div className="space-y-3" aria-busy="true">
          <div className="h-28 animate-pulse rounded-card border border-white/8 bg-white/[0.03]" />
          <div className="h-48 animate-pulse rounded-card border border-white/8 bg-white/[0.03]" />
        </div>
      </Shell>
    );
  }

  if (status === 'guest' || status === 'missing') {
    return (
      <Shell>
        <div className="night-card p-8 text-center">
          <h1 className="font-display text-xl text-white">
            {status === 'guest'
              ? lang === 'km'
                ? 'ចូលគណនីដើម្បីមើលដំណើរនេះ'
                : 'Sign in to open this trip'
              : lang === 'km'
                ? 'រកមិនឃើញដំណើរនេះទេ'
                : "We can't find that trip"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {status === 'guest'
              ? lang === 'km'
                ? 'ដំណើរត្រូវបានរក្សាទុកក្នុងគណនីរបស់អ្នក។'
                : 'Trips are saved to your account.'
              : lang === 'km'
                ? 'វាអាចត្រូវបានលុប ឬជាកម្មសិទ្ធិគណនីផ្សេង។'
                : 'It may have been deleted, or it belongs to another account.'}
          </p>
          {status === 'guest' ? (
            <SignInLink
              returnTo={`/trips/${tripId}`}
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
            >
              {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
            </SignInLink>
          ) : (
            <Link
              href="/trips"
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
            >
              {lang === 'km' ? 'ដំណើរទាំងអស់' : 'All trips'}
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  if (!trip) return null;

  const percent = readinessPercent(trip.readiness);
  const past = Boolean((trip.endDate ?? trip.startDate) && (trip.endDate ?? trip.startDate)! < new Date().toISOString().slice(0, 10));

  return (
    <Shell>
      <Link
        href="/trips"
        className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {lang === 'km' ? 'ដំណើរ' : 'Trips'}
      </Link>

      <header className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {trip.flag ? `${trip.flag} ` : ''}
            {trip.destination}
          </p>
          <h1 className="mt-1.5 font-display text-3xl leading-tight text-white sm:text-4xl">{trip.title}</h1>
          <p className="mt-1.5 font-mono text-sm text-white/60">{dates}</p>
        </div>
        {/* Outlined rather than gold: the sections below own the accent, and a
            trip's own details are rarely the thing you came here to change. */}
        <Link
          href={`/trips/${trip.id}/edit`}
          className="inline-flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-btn border border-white/15 px-4 text-sm font-semibold text-white/80 transition-colors duration-200 ease-smooth hover:border-gold-light/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <Pencil size={14} aria-hidden="true" />
          {lang === 'km' ? 'កែសម្រួល' : 'Edit'}
        </Link>
      </header>

      {!past && (
        <div className="night-card mt-6 p-5">
          <TripProgress readiness={trip.readiness} tripId={trip.id} />
          {percent === 100 && (
            <p className="mt-4 flex items-center gap-2 text-sm text-white/70">
              <StatusBadge tone="success">{lang === 'km' ? 'រួចរាល់' : 'Ready'}</StatusBadge>
              {lang === 'km' ? 'អ្វីៗរួចរាល់សម្រាប់ដំណើរនេះ។' : 'Everything is in place for this trip.'}
            </p>
          )}
        </div>
      )}

      {/* Each section is anchored, and the anchors are exactly the ones the
          notification deep links use. */}
      <div className="mt-4 space-y-4">
        <Section
          id="flight"
          icon={Plane}
          title={lang === 'km' ? 'ជើងហោះហើរ' : 'Flight'}
          done={trip.readiness.flight}
          doneLabel={lang === 'km' ? 'តាមដានហើយ' : 'Tracked'}
          gap={
            lang === 'km'
              ? 'បន្ថែមលេខជើងហោះហើរ ហើយយើងនឹងតាមដានទ្វារ ការពន្យារពេល និងការឡើងយន្តហោះ។'
              : "Add your flight number and we'll watch the gate, delays and boarding for you."
          }
          actionLabel={lang === 'km' ? 'តាមដានជើងហោះហើរ' : 'Track a flight'}
          actionHref="/flights"
        />

        <Section
          id="stay"
          icon={BedDouble}
          title={lang === 'km' ? 'កន្លែងស្នាក់នៅ' : 'Stay'}
          done={trip.readiness.stay}
          doneLabel={lang === 'km' ? 'បានកត់ត្រា' : 'Noted'}
          // Honest: Domner does not sell hotels yet, and this section says so
          // rather than pretending to be a booking flow.
          gap={
            lang === 'km'
              ? 'Domner មិនទាន់កក់សណ្ឋាគារទេ។ អ្នកអាចកត់ត្រាកន្លែងស្នាក់នៅក្នុងកម្មវិធីដំណើររបស់អ្នក។'
              : "Domner doesn't book hotels yet. You can note where you're staying in your itinerary."
          }
          actionLabel={lang === 'km' ? 'បើកកម្មវិធី' : 'Open itinerary'}
          actionHref="#itinerary"
        />

        <Section
          id="esim"
          icon={Signal}
          title={lang === 'km' ? 'ការតភ្ជាប់' : 'Connectivity'}
          done={trip.readiness.esim}
          doneLabel={lang === 'km' ? 'មាន eSIM' : 'eSIM ready'}
          gap={
            lang === 'km'
              ? `ភ្ជាប់អ៊ីនធឺណិតនៅ${trip.destination}ភ្លាមពេលមកដល់ ដោយមិនរកស៊ីមទេ។`
              : `Land in ${trip.destination} already online — no queue, no SIM card.`
          }
          actionLabel={lang === 'km' ? 'យក eSIM' : 'Get an eSIM'}
          actionHref="/esim"
        />

        {weather && (
          <section id="weather" className="scroll-mt-20">
            <WeatherCapsule
              place={trip.destination}
              temperatureC={weather.temperatureC}
              description={weather.description?.[lang] ?? null}
              wet={isWet(weather.code)}
              href={slug ? `/destination/${slug}` : undefined}
            />
          </section>
        )}

        <Section
          id="places"
          icon={MapPin}
          title={lang === 'km' ? 'ទីតាំង' : 'Places'}
          done={trip.readiness.places}
          doneLabel={lang === 'km' ? 'បានរក្សាទុក' : 'Saved'}
          gap={
            lang === 'km'
              ? 'រក្សាទុកកន្លែងដែលអ្នកចង់ទៅ ហើយយើងនឹងប្រាប់ពេលអ្នកនៅជិត។'
              : "Save the places you want to reach and we'll tell you when you're near one."
          }
          actionLabel={lang === 'km' ? 'ស្វែងរក' : 'Explore'}
          actionHref={slug ? `/destination/${slug}` : '/explore'}
        />

        <Section
          id="itinerary"
          icon={ListChecks}
          title={lang === 'km' ? 'កម្មវិធីដំណើរ' : 'Itinerary'}
          done={trip.readiness.itinerary}
          doneLabel={lang === 'km' ? 'បានរៀបចំ' : 'Planned'}
          gap={
            lang === 'km'
              ? 'រៀបចំថ្ងៃរបស់អ្នក ដោយប្រើបញ្ជីត្រួតពិនិត្យដំណើរ។'
              : 'Lay out your days with the travel checklist.'
          }
          actionLabel={lang === 'km' ? 'បើកកម្មវិធី' : 'Open itinerary'}
          actionHref={`/trips/${trip.id}/itinerary`}
        />

        <section id="memories" className="scroll-mt-20">
          <Link
            href={`/trips/${trip.id}/memories`}
            className="night-card flex min-h-[3.5rem] items-center gap-3 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <Camera size={18} className="shrink-0 text-white/55" aria-hidden="true" />
            <span className="flex-1">
              <span className="block font-semibold text-white">
                {lang === 'km' ? 'ការចងចាំ' : 'Memories'}
              </span>
              <span className="block text-sm text-white/55">
                {lang === 'km' ? 'រូបភាព និងកំណត់ត្រាពីដំណើរនេះ' : 'Photos and notes from this trip'}
              </span>
            </span>
          </Link>
        </section>
      </div>

      {/* The two contextual prompts, at the bottom of a screen that just proved
          Domner is worth keeping. Both self-suppress when they have nothing to
          ask for. */}
      {!past && <PermissionPrompt reason="trip" className="mt-6" />}
      <InstallPrompt trigger="trip" className="mt-4" />

      {weather === null && slug === null && (
        <p className="mt-6 flex items-center gap-2 text-xs text-white/40">
          <CloudSun size={14} aria-hidden="true" />
          {lang === 'km'
            ? 'អាកាសធាតុមានសម្រាប់គោលដៅដែលយើងបានសរសេរមគ្គុទ្ទេសក៍។'
            : 'Live weather is available for destinations we have written a guide for.'}
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">{children}</div>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  done,
  doneLabel,
  gap,
  actionLabel,
  actionHref,
}: {
  id: string;
  icon: typeof Plane;
  title: string;
  done: boolean;
  doneLabel: string;
  gap: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <section id={id} className="night-card scroll-mt-20 p-5" aria-labelledby={`section-${id}`}>
      <div className="flex items-center gap-3">
        <Icon size={18} className="shrink-0 text-white/55" aria-hidden="true" />
        <h2 id={`section-${id}`} className="flex-1 font-semibold text-white">
          {title}
        </h2>
        {done && <StatusBadge tone="success">{doneLabel}</StatusBadge>}
      </div>

      {!done && (
        <>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{gap}</p>
          <Link
            href={actionHref}
            className="mt-3 inline-flex min-h-[2.5rem] items-center rounded-btn border border-gold-light/40 px-3.5 text-sm font-semibold text-gold-bright transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            {actionLabel}
          </Link>
        </>
      )}
    </section>
  );
}
