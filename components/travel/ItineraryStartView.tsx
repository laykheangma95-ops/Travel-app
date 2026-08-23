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

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Loader2, MapPinned, Sparkles, TriangleAlert } from 'lucide-react';
import type { ItineraryPayload } from '@/lib/travel/itinerary';
import type { DraftPace, DraftPreferences } from '@/lib/travel/smartDraft';
import { ItineraryEditor } from './ItineraryEditor';
import { useLang } from '@/lib/i18n';

type Mode = 'choose' | 'manual' | 'generating';
type GenerationStage = 'reading' | 'building' | 'verifying';
/**
 * Whether this screen actually knows what is in the trip. 'failed' is the state
 * that used to be indistinguishable from 'ready', and the reason a healthy trip
 * could report itself as missing.
 */
type SnapshotState = 'loading' | 'ready' | 'failed';

interface Snapshot {
  curatedCount: number;
  /** Scheduled places the smart draft would replace. Ideas are preserved. */
  existingCount: number;
  savedCount: number;
}

const INTERESTS = [
  { value: 'spot', en: 'Culture & sights', km: 'វប្បធម៌ និងទេសភាព' },
  { value: 'food', en: 'Local food', km: 'ម្ហូបមូលដ្ឋាន' },
  { value: 'shopping', en: 'Shopping', km: 'ការទិញទំនិញ' },
  { value: 'stay', en: 'Stays', km: 'កន្លែងស្នាក់នៅ' },
] as const;

export function ItineraryStartView({ tripId }: { tripId: string }) {
  const { lang } = useLang();
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>('loading');
  /** The server's own words, when it gave any. Far better than a generic retry. */
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stage, setStage] = useState<GenerationStage>('reading');
  const [preferences, setPreferences] = useState<DraftPreferences>({
    pace: 'balanced', interests: ['spot', 'food'], startTime: '09:00', includeSaved: true,
  });

  // Read the trip once so this screen knows what it is about to overwrite and
  // whether there is anything to generate from.
  //
  // THE BUG THIS FIXES: every failure here used to be swallowed — a non-ok
  // response became null, and .catch() became undefined — so `snapshot` stayed
  // null and `empty` evaluated false. A screen that had failed to load looked
  // identical to one that had loaded fine, and it left "Build a smart draft"
  // ENABLED. Pressing it then surfaced a raw server error ("That trip could not
  // be found", "Could not read the latest trip details") on a trip that was
  // perfectly healthy. The screen never offers an action it cannot confirm.
  const loadSnapshot = useCallback(() => {
    let cancelled = false;
    setSnapshotState('loading');
    fetch(`/api/travel/itinerary/${tripId}`, { credentials: 'include' })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          setSnapshotError(body?.error?.message ?? null);
          setSnapshotState('failed');
          return;
        }
        const body = (await response.json()) as ItineraryPayload;
        const scheduled = body.days.reduce((total, day) => total + day.places.length, 0);
        setSnapshot({
          curatedCount: body.curatedPlaces.length,
          existingCount: scheduled,
          savedCount: body.ideas.length,
        });
        setSnapshotError(null);
        setSnapshotState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshotError(null);
        setSnapshotState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => loadSnapshot(), [loadSnapshot]);

  async function generate() {
    setError(null);
    setConfirming(false);
    setMode('generating');
    try {
      setStage('reading');
      const latest = await fetch(`/api/travel/itinerary/${tripId}`, { credentials: 'include' });
      if (!latest.ok) throw new Error(lang === 'km' ? 'បើកទិន្នន័យដំណើរមិនបាន។' : 'Could not read the latest trip details.');
      setStage('building');
      const response = await fetch(`/api/travel/itinerary/${tripId}/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
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
      setStage('verifying');
      const verified = await fetch(`/api/travel/itinerary/${tripId}`, { credentials: 'include' });
      const itinerary = verified.ok ? (await verified.json() as ItineraryPayload) : null;
      if (!itinerary || itinerary.days.every((day) => day.places.length === 0)) {
        throw new Error(lang === 'km' ? 'មិនអាចផ្ទៀងផ្ទាត់កម្មវិធីដំណើរដែលបានរក្សាទុក។' : 'The saved itinerary could not be verified.');
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
  if (mode === 'generating') return <GeneratingView stage={stage} />;

  const empty = snapshot !== null && snapshot.curatedCount === 0;
  // A smart draft needs places the server has confirmed. "We could not read the
  // trip" and "we have not looked yet" are both reasons to withhold the button
  // — not to offer it and let the traveler discover the failure by pressing it.
  const canGenerate = snapshotState === 'ready' && !empty;

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

        {snapshotState === 'failed' && (
          <div
            role="alert"
            className="mt-5 rounded-btn border border-danger/30 bg-danger/10 px-4 py-3.5"
          >
            <p className="flex items-start gap-2 text-sm leading-relaxed text-red-100">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-200" aria-hidden="true" />
              <span>
                {snapshotError ??
                  (lang === 'km'
                    ? 'មិនអាចអានព័ត៌មានដំណើររបស់អ្នកបានទេ។ ដំណើររបស់អ្នកនៅដដែល — គ្រាន់តែយើងមិនអាចទាញវាឥឡូវនេះ។'
                    : 'We could not read this trip just now. Your trip is safe — we simply could not load it. Check your connection and try again.')}
              </span>
            </p>
            <button
              type="button"
              onClick={() => loadSnapshot()}
              className="mt-3 inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/20 px-4 text-sm font-semibold text-white transition-colors hover:border-gold-light/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              {lang === 'km' ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
            </button>
          </div>
        )}

        {empty && (
          <div className="mt-5 rounded-btn border border-gold-light/25 bg-gold-light/10 px-4 py-3.5">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-white/80">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-gold-light" aria-hidden="true" />
              <span>
                {lang === 'km'
                  ? 'យើងមិនទាន់បានសរសេរអំពីគោលដៅនេះទេ ដូច្នេះមិនមានអនុសាសន៍ដើម្បីបង្កើតកម្មវិធីដោយស្វ័យប្រវត្តិឡើយ។ អ្នកនៅតែអាចបន្ថែមទីតាំងផ្ទាល់ខ្លួនបាន។'
                  : "We haven't written this destination up yet, so there is nothing for a smart draft to draw on. You can still build the days yourself and add your own places."}
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
            disabled={!canGenerate}
            className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-white/8 motion-reduce:hover:translate-y-0"
          >
            <div className="relative flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#282b52] via-[#644d78] to-[#d47e68] p-5">
              <Sparkles size={42} className="text-gold-bright" strokeWidth={1.5} aria-hidden="true" />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">
                {lang === 'km' ? 'រៀបចំឆ្លាតវៃ' : 'Smart planning'}
              </span>
            </div>
            <div className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
                {lang === 'km' ? 'សម្រាប់អ្នកចង់បានគំនិត' : 'For the inspired explorer'}
              </p>
              <h2 className="mt-2 font-display text-2xl">
                {lang === 'km' ? 'បង្កើតសេចក្តីព្រាងឆ្លាតវៃ' : 'Build a smart draft'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                {snapshotState === 'failed'
                  ? lang === 'km'
                    ? 'មិនអាចអានដំណើរបានទេ។ សូមព្យាយាមម្ដងទៀតខាងលើ។'
                    : 'We could not read this trip. Try again above.'
                  : empty
                  ? lang === 'km'
                    ? 'មិនអាចប្រើបានសម្រាប់គោលដៅនេះនៅឡើយទេ។'
                    : 'Not available for this destination yet.'
                  : lang === 'km'
                    ? 'ទទួលបានសេចក្តីព្រាងដំបូងពីទីតាំងដែលរក្សាទុក និងអនុសាសន៍មូលដ្ឋាន។ កែបានទាំងអស់ក្រោយមក។'
                    : 'Get a first draft built from saved places and locally curated recommendations. Edit everything afterward.'}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">
                <Sparkles size={16} aria-hidden="true" />
                {lang === 'km' ? 'រៀបចំឲ្យខ្ញុំ' : 'Arrange my trip'}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </div>
          </button>
        </section>

        {!empty && (
          <section className="night-card mt-5 p-5 sm:p-6" aria-labelledby="draft-preferences-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
                  {lang === 'km' ? 'ចំណូលចិត្តសម្រាប់សេចក្តីព្រាង' : 'Draft preferences'}
                </p>
                <h2 id="draft-preferences-title" className="mt-1 font-display text-xl text-white">
                  {lang === 'km' ? 'ធ្វើឲ្យថ្ងៃទាំងនេះសមនឹងអ្នក' : 'Make the days fit you'}
                </h2>
              </div>
              <label className="flex items-center gap-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={preferences.includeSaved}
                  onChange={(event) => setPreferences({ ...preferences, includeSaved: event.target.checked })}
                  className="h-5 w-5 accent-[#e8c887]"
                />
                {lang === 'km' ? `ប្រើទីតាំងដែលបានរក្សាទុក (${snapshot?.savedCount ?? 0})` : `Prioritise saved places (${snapshot?.savedCount ?? 0})`}
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-white/80">{lang === 'km' ? 'ល្បឿនដំណើរ' : 'Travel pace'}</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['relaxed', 'balanced', 'full'] as DraftPace[]).map((pace) => (
                  <button
                    key={pace}
                    type="button"
                    aria-pressed={preferences.pace === pace}
                    onClick={() => setPreferences({ ...preferences, pace })}
                    className={`min-h-[2.75rem] rounded-btn border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light ${preferences.pace === pace ? 'border-gold-light/60 bg-gold-light/15 text-gold-bright' : 'border-white/12 text-white/70 hover:border-white/25'}`}
                  >
                    {pace === 'relaxed' ? (lang === 'km' ? 'សម្រាក' : 'Relaxed') : pace === 'balanced' ? (lang === 'km' ? 'សមតុល្យ' : 'Balanced') : (lang === 'km' ? 'ពេញថ្ងៃ' : 'Full days')}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-white/80">{lang === 'km' ? 'អ្វីដែលអ្នកចូលចិត្ត' : 'What you enjoy'}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {INTERESTS.map((interest) => {
                  const selected = preferences.interests.includes(interest.value);
                  return (
                    <button
                      key={interest.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPreferences({
                        ...preferences,
                        interests: selected && preferences.interests.length > 1
                          ? preferences.interests.filter((value) => value !== interest.value)
                          : selected ? preferences.interests : [...preferences.interests, interest.value],
                      })}
                      className={`min-h-[2.75rem] rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light ${selected ? 'border-gold-light/60 bg-gold-light/15 text-gold-bright' : 'border-white/12 text-white/70 hover:border-white/25'}`}
                    >
                      {interest[lang]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-5 flex max-w-xs items-center justify-between gap-4 text-sm font-semibold text-white/80">
              {lang === 'km' ? 'ចាប់ផ្តើមរាល់ថ្ងៃ' : 'Start each day'}
              <input
                type="time"
                value={preferences.startTime}
                onChange={(event) => setPreferences({ ...preferences, startTime: event.target.value })}
                className="min-h-[2.75rem] rounded-btn border border-white/12 bg-white/[0.04] px-3 text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
              />
            </label>
          </section>
        )}

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
            {lang === 'km' ? 'សេចក្តីព្រាងឆ្លាតវៃនៅតែកែបាន' : 'Smart drafts stay editable'}
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
            ? `សេចក្តីព្រាងឆ្លាតវៃនឹងជំនួសទីតាំងដែលបានកំណត់ពេលទាំង ${count}។ បញ្ជីគំនិតដែលបានរក្សាទុករបស់អ្នកនឹងនៅដដែល។`
            : `The smart draft will replace ${count} scheduled ${count === 1 ? 'place' : 'places'}. Your saved Ideas list will stay intact.`}
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

function LandmarkSvg({ kind }: { kind: 'tower' | 'liberty' | 'temple' }) {
  const paths = {
    tower: (
      <>
        <path d="M12 3L7 21M12 3l5 18M8.5 15h7M9.5 11h5M6.5 21h11" />
        <path d="M10 7h4M8 19h8" />
      </>
    ),
    liberty: (
      <>
        <path d="M12 4l-3 4h6l-3-4Z" />
        <path d="M10 8v4l-2 7h8l-2-7V8" />
        <path d="M8 12h8M9 19h6M12 4V2M8.5 5.5 7 4M15.5 5.5 17 4" />
      </>
    ),
    temple: (
      <>
        <path d="M4 10h16L12 4 4 10Z" />
        <path d="M6 10v9M10 10v9M14 10v9M18 10v9M4 19h16M5 22h14" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
}

function GeneratingView({ stage }: { stage: GenerationStage }) {
  const { lang } = useLang();
  const labels: Record<GenerationStage, { en: string; km: string }> = {
    reading: { en: 'Reading your saved places and trip dates…', km: 'កំពុងអានទីតាំងដែលបានរក្សាទុក និងកាលបរិច្ឆេទ…' },
    building: { en: 'Grouping nearby places around your preferences…', km: 'កំពុងរៀបទីតាំងជិតគ្នាតាមចំណូលចិត្តរបស់អ្នក…' },
    verifying: { en: 'Checking the itinerary was saved correctly…', km: 'កំពុងផ្ទៀងផ្ទាត់ថាកម្មវិធីដំណើរបានរក្សាទុកត្រឹមត្រូវ…' },
  };

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
          <div className="itinerary-landmark itinerary-landmark-eiffel" aria-hidden="true">
            <LandmarkSvg kind="tower" />
          </div>
          <div className="itinerary-landmark itinerary-landmark-liberty" aria-hidden="true">
            <LandmarkSvg kind="liberty" />
          </div>
          <div className="itinerary-landmark itinerary-landmark-temple" aria-hidden="true">
            <LandmarkSvg kind="temple" />
          </div>
          <div className="itinerary-globe" aria-hidden="true">
            <div className="itinerary-globe-grid" />
            <div className="itinerary-globe-glow" />
            <span className="itinerary-globe-pin pin-one" />
            <span className="itinerary-globe-pin pin-two" />
            <span className="itinerary-globe-pin pin-three" />
          </div>
          <div className="itinerary-flight-path path-one" aria-hidden="true" />
          <div className="itinerary-flight-path path-two" aria-hidden="true" />
        </div>

        <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/80 bg-white/55 p-5 shadow-[0_14px_50px_rgba(102,92,60,.1)] backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-center justify-center gap-5 text-center text-[10px] font-semibold uppercase tracking-[.12em] text-[#94733a] sm:gap-10 [&_span]:inline-flex [&_span]:items-center [&_span]:gap-2" aria-hidden="true">
            <span><MapPinned size={16} aria-hidden="true" /><b>Global<br />destinations</b></span>
            <span><ArrowRight size={16} aria-hidden="true" /><b>Seamless<br />journeys</b></span>
            <span><Sparkles size={16} aria-hidden="true" /><b>Curated<br />experiences</b></span>
            <span><Check size={16} aria-hidden="true" /><b>Trusted<br />service</b></span>
            <span><CalendarDays size={16} aria-hidden="true" /><b>Memories<br />that last</b></span>
          </div>
          <p role="status" className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-black/65">
            <Loader2 size={16} className="animate-spin text-[#b18436] motion-reduce:animate-none" aria-hidden="true" />
            {labels[stage][lang]}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
            {(['reading', 'building', 'verifying'] as GenerationStage[]).map((item, index) => {
              const current = ['reading', 'building', 'verifying'].indexOf(stage);
              return <span key={item} className={`h-1.5 rounded-full transition-colors ${index <= current ? 'bg-[#b18436]' : 'bg-black/10'}`} />;
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
