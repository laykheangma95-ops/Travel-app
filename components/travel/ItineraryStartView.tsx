'use client';

// ─────────────────────────────────────────────────────────────────────────────
// How would you like to plan this trip?
//
// Three things this screen used to get wrong:
//
//   1. "Generate with AI" deleted every place on the trip — including the
//      private Ideas list — before writing its draft, with no warning and no
//      undo, on a trip that might already hold days of manual work. It now says
//      what it is about to replace and asks first.
//   2. A failed generation rendered "[object Object]". The API returns
//      `error` as { code, message }, and the carefully written server message
//      ("we do not have enough recommendations for this destination yet") is
//      exactly the one a traveler most needs to see.
//   3. It offered both paths identically whether or not the destination had a
//      single place behind it. Where there is nothing to draw on, it now says so
//      and points at the path that does work.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Loader2, MapPinned, Sparkles, TriangleAlert } from 'lucide-react';
import type { ItineraryPayload } from '@/lib/travel/itinerary';
import { ItineraryEditor } from './ItineraryEditor';
import { useLang } from '@/lib/i18n';

type Mode = 'choose' | 'manual' | 'generating';

interface Snapshot {
  curatedCount: number;
  /** Places already placed on days or in Ideas — what generation would discard. */
  existingCount: number;
}

export function ItineraryStartView({ tripId }: { tripId: string }) {
  const { lang } = useLang();
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Read the trip once so this screen knows what it is about to overwrite and
  // whether there is anything to generate from.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/travel/itinerary/${tripId}`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ItineraryPayload | null) => {
        if (cancelled || !body) return;
        const scheduled = body.days.reduce((total, day) => total + day.places.length, 0);
        setSnapshot({
          curatedCount: body.curatedPlaces.length,
          existingCount: scheduled + body.ideas.length,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function generate() {
    setError(null);
    setConfirming(false);
    setMode('generating');
    try {
      const response = await fetch(`/api/travel/itinerary/${tripId}/generate`, {
        method: 'POST',
        credentials: 'include',
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        // `error` is an object, not a string. Throwing it directly is what
        // produced "[object Object]" and swallowed the real message.
        throw new Error(
          result?.error?.message ??
            (lang === 'km' ? 'បង្កើតកម្មវិធីមិនបាន។' : 'Could not generate an itinerary.')
        );
      }
      setMode('manual');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : lang === 'km'
            ? 'បង្កើតកម្មវិធីមិនបាន។'
            : 'Could not generate an itinerary.'
      );
      setMode('choose');
    }
  }

  function startGenerate() {
    // Only stop to ask when there is genuinely something to lose.
    if ((snapshot?.existingCount ?? 0) > 0) {
      setConfirming(true);
      return;
    }
    void generate();
  }

  if (mode === 'manual') return <ItineraryEditor tripId={tripId} />;
  if (mode === 'generating') return <GeneratingView />;

  const empty = snapshot !== null && snapshot.curatedCount === 0;

  return (
    <div className="night-canvas has-tabbar relative min-h-screen pb-20 text-white">
      <div className="night-stars" aria-hidden="true" />
      <main className="relative mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold-light">
          {lang === 'km' ? 'បង្កើតកម្មវិធីដំណើរ' : 'Build your itinerary'}
        </p>
        <h1 className="mt-2 max-w-xl font-display text-3xl leading-tight sm:text-5xl">
          {lang === 'km' ? 'តើអ្នកចង់រៀបចំដំណើរនេះយ៉ាងណា?' : 'How would you like to plan this trip?'}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
          {lang === 'km'
            ? 'ចាប់ផ្តើមពីគំនិតរបស់អ្នក ឬឲ្យ Domner រៀបចំសេចក្តីព្រាងដំបូងពីទីតាំងដែលអ្នករក្សាទុក និងអនុសាសន៍មូលដ្ឋាន។'
            : 'Start with your own ideas, or let Domner arrange a first draft from the places you saved and our local recommendations.'}
        </p>

        {error && (
          <p role="alert" className="mt-5 rounded-btn border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}

        {empty && (
          <div className="mt-5 rounded-btn border border-gold-light/25 bg-gold-light/10 px-4 py-3.5">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-white/80">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-gold-light" aria-hidden="true" />
              <span>
                {lang === 'km'
                  ? 'យើងមិនទាន់បានសរសេរអំពីគោលដៅនេះទេ ដូច្នេះមិនមានអនុសាសន៍ដើម្បីបង្កើតកម្មវិធីដោយស្វ័យប្រវត្តិឡើយ។ អ្នកនៅតែអាចបន្ថែមទីតាំងផ្ទាល់ខ្លួនបាន។'
                  : "We haven't written this destination up yet, so there is nothing for the AI draft to draw on. You can still build the days yourself and add your own places."}
              </span>
            </p>
          </div>
        )}

        <section className="mt-9 grid gap-4 md:grid-cols-2" aria-label={lang === 'km' ? 'ជម្រើសរៀបចំកម្មវិធី' : 'Itinerary planning options'}>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light motion-reduce:hover:translate-y-0"
          >
            <div className="flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#1d4b5b] via-[#275b65] to-[#d7ad68] p-5">
              <MapPinned size={42} className="text-white/90" strokeWidth={1.5} aria-hidden="true" />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">
                {lang === 'km' ? 'ផ្ទាំងរបស់អ្នក' : 'Your canvas'}
              </span>
            </div>
            <div className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
                {lang === 'km' ? 'សម្រាប់អ្នករៀបចំដោយខ្លួនឯង' : 'For the hands-on planner'}
              </p>
              <h2 className="mt-2 font-display text-2xl">
                {lang === 'km' ? 'បង្កើតដោយខ្លួនឯង' : 'Create it yourself'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                {lang === 'km'
                  ? 'បន្ថែមទីតាំងទៅគំនិត បង្កើតថ្ងៃ ហើយរៀបចំរាល់ចំណតតាមលំដាប់ដែលអ្នកចង់បាន។'
                  : 'Add places to ideas, make days, and arrange every stop in the order that feels right.'}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">
                {lang === 'km' ? 'ចាប់ផ្តើមពីដំបូង' : 'Start from scratch'}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={startGenerate}
            disabled={empty}
            className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-white/8 motion-reduce:hover:translate-y-0"
          >
            <div className="relative flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#282b52] via-[#644d78] to-[#d47e68] p-5">
              <Sparkles size={42} className="text-gold-bright" strokeWidth={1.5} aria-hidden="true" />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">
                {lang === 'km' ? 'ជំនួយដោយ AI' : 'AI-assisted'}
              </span>
            </div>
            <div className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
                {lang === 'km' ? 'សម្រាប់អ្នកចង់បានគំនិត' : 'For the inspired explorer'}
              </p>
              <h2 className="mt-2 font-display text-2xl">
                {lang === 'km' ? 'បង្កើតដោយ AI' : 'Generate with AI'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                {empty
                  ? lang === 'km'
                    ? 'មិនអាចប្រើបានសម្រាប់គោលដៅនេះនៅឡើយទេ។'
                    : 'Not available for this destination yet.'
                  : lang === 'km'
                    ? 'ទទួលបានសេចក្តីព្រាងដំបូងពីទីតាំងដែលរក្សាទុក និងអនុសាសន៍មូលដ្ឋាន។ កែបានទាំងអស់ក្រោយមក។'
                    : 'Get a first draft built from saved places and locally curated recommendations. Edit everything afterward.'}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">
                <Sparkles size={16} aria-hidden="true" />
                {lang === 'km' ? 'បង្កើតវា' : 'Dream it up'}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </div>
          </button>
        </section>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-gold-light" aria-hidden="true" />
            {lang === 'km' ? 'ផ្លាស់ប្តូរបានគ្រប់ពេល' : 'Change it anytime'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={14} className="text-gold-light" aria-hidden="true" />
            {lang === 'km' ? 'បន្ថែមថ្ងៃពេលក្រោយ' : 'Add dates later'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold-light" aria-hidden="true" />
            {lang === 'km' ? 'អនុសាសន៍ AI នៅតែកែបាន' : 'AI suggestions stay editable'}
          </span>
        </div>
      </main>

      {confirming && snapshot && (
        <ReplaceDialog
          count={snapshot.existingCount}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void generate()}
        />
      )}
    </div>
  );
}

/**
 * The generation route clears every itinerary_place on the trip before writing
 * its draft. That is destructive and irreversible, so it is stated plainly and
 * the cancel is the default-looking button.
 */
function ReplaceDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { lang } = useLang();

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-title"
    >
      <button
        type="button"
        aria-label={lang === 'km' ? 'បិទ' : 'Close'}
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <div className="night-card relative w-full max-w-md p-6">
        <h2 id="replace-title" className="font-display text-xl text-white">
          {lang === 'km' ? 'ជំនួសកម្មវិធីបច្ចុប្បន្ន?' : 'Replace what you have?'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          {lang === 'km'
            ? `ការបង្កើតដោយ AI នឹងលុបទីតាំងទាំង ${count} ដែលមានស្រាប់ក្នុងដំណើរនេះ រួមទាំងបញ្ជីគំនិតរបស់អ្នក ហើយសរសេរសេចក្តីព្រាងថ្មី។ មិនអាចត្រឡប់វិញបានទេ។`
            : `Generating will remove the ${count} ${count === 1 ? 'place' : 'places'} already on this trip, including your Ideas list, and write a fresh draft. This cannot be undone.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            {lang === 'km' ? 'រក្សាទុកអ្វីដែលមាន' : 'Keep what I have'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-btn border border-danger/50 px-5 text-sm font-semibold text-danger transition-colors hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            {lang === 'km' ? 'ជំនួសវា' : 'Replace it'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneratingView() {
  const { lang } = useLang();

  return (
    <div className="itinerary-ai-loading relative min-h-screen overflow-hidden text-[#1c252a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.96),rgba(239,229,211,.74)_52%,rgba(208,222,228,.9))]" />
      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-10 pt-10 sm:px-12 sm:pt-14">
        <div className="max-w-xs">
          <p className="text-4xl font-semibold leading-[.98] tracking-[-.06em] sm:text-5xl">
            One world.
            <br />
            Endless
            <br />
            <span className="text-[#b18436]">adventures.</span>
          </p>
          <div className="mt-5 h-px w-52 bg-[#bd9956]" />
          <p className="mt-4 text-sm leading-relaxed text-black/60">
            Discover more.
            <br />
            Experience more.
            <br />
            Be more.
          </p>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-8">
          <div className="itinerary-landmark itinerary-landmark-eiffel" aria-hidden="true">♜</div>
          <div className="itinerary-landmark itinerary-landmark-liberty" aria-hidden="true">♟</div>
          <div className="itinerary-landmark itinerary-landmark-temple" aria-hidden="true">⌂</div>
          <div className="itinerary-globe" aria-hidden="true">
            <div className="itinerary-globe-grid" />
            <div className="itinerary-globe-glow" />
            <span className="itinerary-globe-pin pin-one">•</span>
            <span className="itinerary-globe-pin pin-two">•</span>
            <span className="itinerary-globe-pin pin-three">•</span>
          </div>
          <div className="itinerary-flight-path path-one" aria-hidden="true" />
          <div className="itinerary-flight-path path-two" aria-hidden="true" />
        </div>

        <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/80 bg-white/55 p-5 shadow-[0_14px_50px_rgba(102,92,60,.1)] backdrop-blur-md sm:p-6">
          <div className="flex items-center justify-center gap-6 text-center text-[10px] font-semibold uppercase tracking-[.12em] text-[#94733a] sm:gap-12" aria-hidden="true">
            <span>◎<b>Global<br />destinations</b></span>
            <span>✈<b>Seamless<br />journeys</b></span>
            <span>✧<b>Curated<br />experiences</b></span>
            <span>✓<b>Trusted<br />service</b></span>
            <span>▣<b>Memories<br />that last</b></span>
          </div>
          <p role="status" className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-black/65">
            <Loader2 size={16} className="animate-spin text-[#b18436] motion-reduce:animate-none" aria-hidden="true" />
            {lang === 'km' ? 'កំពុងរៀបចំថ្ងៃរបស់អ្នក…' : 'Mapping your perfect days…'}
          </p>
        </div>
      </main>
    </div>
  );
}
