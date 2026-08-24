'use client';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — "I saw this on TikTok" → places on a trip.
//
// The screen the whole feature lives on. It is four states on one surface —
// paste, parsing, review, done — rather than four routes, because the traveler
// is doing ONE thing and a page change between each step would read as four.
//
// THE ONE RULE THIS SCREEN IS BUILT AROUND: nothing is written until the
// traveler says so. Extraction is a read (app/api/travel/extract writes
// nothing at all), the review list is fully editable, and the gold CTA at the
// bottom is the only thing that touches the database. A wrong guess therefore
// costs a glance, not a cleanup — which is what lets the importer be bold about
// what it offers rather than timid about what it commits.
//
// Honesty is a design element here, not a disclaimer. The parsing state says
// the reading may be wrong, low-confidence rows arrive un-ticked, a place with
// no pin says so, and a platform that refused us gets its own sentence with the
// way around it. An importer that quietly saved nine wrong places would be
// worse than one that found five and said so.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/ui/Reveal';
import { CATEGORY_LABEL, type ItineraryCategory } from '@/lib/travel/itinerary';
import { classifyLink, firstUrlIn, PLATFORM_LABEL, type LinkPlatform } from '@/lib/travel/socialLink';
import { AUTO_SELECT_CONFIDENCE, type PlaceCandidate } from '@/lib/travel/placeExtraction';

type Stage = 'paste' | 'parsing' | 'review' | 'done';

interface ExtractResponse {
  outcome: 'ok' | 'no-places-found' | 'caption-unavailable' | 'link-unreadable';
  platform: LinkPlatform | null;
  preview: {
    title: string | null;
    author: string | null;
    thumbnailUrl: string | null;
    canonicalUrl: string | null;
  } | null;
  candidates: PlaceCandidate[];
  destination: string | null;
  capabilities: { model: boolean; geocoding: boolean };
  /** The server's record of this extraction. Handed back on save so the place
   *  keeps a link to the post it came from. Null when the ledger was down. */
  importId: string | null;
  /** True when the server answered from an earlier identical import. */
  reused: boolean;
}

interface TripOption {
  id: string;
  title: string;
  destination: string;
  start_date?: string | null;
  end_date?: string | null;
}

interface ImportOutcome {
  tripId: string;
  tripTitle: string;
  createdTrip: boolean;
  added: string[];
  skipped: string[];
  failed: string[];
}

/** A candidate plus the state the review list keeps about it. */
interface ReviewRow extends PlaceCandidate {
  key: string;
  selected: boolean;
  editing: boolean;
}

// ── Copy. `km` mirrors every `en` key, never a subset (§11 of CLAUDE.md). ─────
const COPY = {
  eyebrow: { en: 'Import', km: 'នាំចូល' },
  heading: { en: 'Turn a post into a plan', km: 'ប្តូរការបង្ហោះទៅជាផែនការ' },
  sub: {
    en: 'Paste a link from TikTok, Instagram, Facebook, YouTube or Google Maps. We read the places out of it and put them on your trip.',
    km: 'បិទភ្ជាប់តំណពី TikTok, Instagram, Facebook, YouTube ឬ Google Maps។ យើងនឹងអានទីតាំងចេញពីវា ហើយដាក់ទៅក្នុងដំណើររបស់អ្នក។',
  },
  label: { en: 'Link or text', km: 'តំណ ឬអត្ថបទ' },
  placeholder: {
    en: 'Paste a link here — or paste the caption itself',
    km: 'បិទភ្ជាប់តំណនៅទីនេះ — ឬបិទភ្ជាប់អត្ថបទរបស់ការបង្ហោះ',
  },
  paste: { en: 'Paste', km: 'បិទភ្ជាប់' },
  find: { en: 'Find places', km: 'រកទីតាំង' },
  reading: { en: 'Reading the post…', km: 'កំពុងអានការបង្ហោះ…' },
  mayBeWrong: {
    en: 'Places and plans may be read wrongly, or not at all.',
    km: 'ទីតាំង និងផែនការអាចត្រូវបានអានខុស ឬអានមិនបាន។',
  },
  cancel: { en: 'Cancel', km: 'បោះបង់' },
  found: { en: 'Places found', km: 'ទីតាំងដែលរកឃើញ' },
  selectAll: { en: 'Select all', km: 'ជ្រើសទាំងអស់' },
  clearAll: { en: 'Clear', km: 'សម្អាត' },
  addToPlan: { en: 'Add to plan', km: 'បន្ថែមទៅផែនការ' },
  chooseTrip: { en: 'Which trip?', km: 'ដំណើរណាមួយ?' },
  newTrip: { en: 'New trip', km: 'ដំណើរថ្មី' },
  createNow: { en: 'Create now', km: 'បង្កើតឥឡូវ' },
  where: { en: 'Where is this trip to?', km: 'ដំណើរនេះទៅកន្លែងណា?' },
  noPin: { en: 'No pin', km: 'គ្មានចំណុចលើផែនទី' },
  onMap: { en: 'On the map', km: 'នៅលើផែនទី' },
  edit: { en: 'Edit', km: 'កែ' },
  done: { en: 'Done', km: 'រួចរាល់' },
  saved: { en: 'Saved to your trip', km: 'បានរក្សាទុកទៅដំណើររបស់អ្នក' },
  openTrip: { en: 'Open the trip', km: 'បើកដំណើរ' },
  openItinerary: { en: 'Open the itinerary', km: 'បើកកម្មវិធីដំណើរ' },
  importAnother: { en: 'Import another', km: 'នាំចូលមួយទៀត' },
  alreadyThere: { en: 'already on this trip', km: 'មាននៅលើដំណើរនេះរួចហើយ' },
  couldNotSave: { en: 'could not be saved', km: 'មិនអាចរក្សាទុកបាន' },
  nothingFound: { en: 'No places in that one', km: 'គ្មានទីតាំងនៅក្នុងនោះទេ' },
  nothingFoundHelp: {
    en: 'The post did not name a place we could recognise. Paste the caption text and we will read that instead.',
    km: 'ការបង្ហោះនោះមិនបានបញ្ជាក់ឈ្មោះទីតាំងដែលយើងស្គាល់ទេ។ សូមបិទភ្ជាប់អត្ថបទរបស់វា ហើយយើងនឹងអានវាជំនួស។',
  },
  captionUnavailable: { en: 'That app would not show us the caption', km: 'កម្មវិធីនោះមិនបង្ហាញអត្ថបទដល់យើងទេ' },
  captionUnavailableHelp: {
    en: 'Instagram and Facebook usually keep captions behind a login. Copy the caption text from the post and paste it here — that always works.',
    km: 'Instagram និង Facebook ភាគច្រើនរក្សាអត្ថបទនៅក្រោយការចូលគណនី។ សូមចម្លងអត្ថបទពីការបង្ហោះ ហើយបិទភ្ជាប់នៅទីនេះ — វាដំណើរការជានិច្ច។',
  },
  linkUnreadable: { en: 'We could not open that link', km: 'យើងមិនអាចបើកតំណនោះបានទេ' },
  linkUnreadableHelp: {
    en: 'Check the link is complete, or paste the caption text instead.',
    km: 'សូមពិនិត្យថាតំណពេញលេញ ឬបិទភ្ជាប់អត្ថបទជំនួស។',
  },
  tryAgain: { en: 'Try another link', km: 'សាកតំណផ្សេង' },
  signIn: { en: 'Sign in to import places', km: 'ចូលគណនីដើម្បីនាំចូលទីតាំង' },
  basicMode: {
    en: 'Reading captions without AI — simple lists work best.',
    km: 'កំពុងអានអត្ថបទដោយគ្មាន AI — បញ្ជីសាមញ្ញដំណើរការល្អបំផុត។',
  },
} as const;

const PLATFORM_ORDER: LinkPlatform[] = ['tiktok', 'instagram', 'facebook', 'youtube', 'google-maps'];

export function ImportPlacesView({
  initialInput = '',
  initialTripId = null,
}: {
  initialInput?: string;
  initialTripId?: string | null;
}) {
  const { lang } = useLang();
  const t = useCallback((key: keyof typeof COPY) => COPY[key][lang], [lang]);

  const [stage, setStage] = useState<Stage>('paste');
  const [input, setInput] = useState(initialInput);
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [tripSheetOpen, setTripSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // The request in flight, so Cancel actually cancels rather than just
  // navigating away from a call that keeps running and keeps costing.
  const abortRef = useRef<AbortController | null>(null);

  const detected = useMemo(() => {
    const link = firstUrlIn(input);
    return link ? classifyLink(link) : null;
  }, [input]);

  const runExtract = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStage('parsing');
      setError(null);
      setResult(null);

      try {
        const response = await fetch('/api/travel/extract', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: trimmed }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | (ExtractResponse & { error?: { message?: string } })
          | null;

        if (response.status === 401) {
          setError(t('signIn'));
          setStage('paste');
          return;
        }
        if (!response.ok || !body) {
          throw new Error(body?.error?.message ?? '');
        }

        setResult(body);
        setRows(
          body.candidates.map((candidate, index) => ({
            ...candidate,
            key: `${index}-${candidate.name}`,
            // A guess arrives un-ticked. Making the traveler un-tick eight bad
            // rows is the fastest way to make an importer feel like a chore.
            selected: candidate.confidence >= AUTO_SELECT_CONFIDENCE,
            editing: false,
          }))
        );
        setStage('review');
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : lang === 'km'
              ? 'មិនអាចអានវាបានទេ។ សូមព្យាយាមម្តងទៀត។'
              : 'We could not read that. Please try again.'
        );
        setStage('paste');
      }
    },
    [lang, t]
  );

  // A share from another app lands here with the link already in hand. Reading
  // it starts immediately — asking someone who just tapped "Share → Domner" to
  // then tap "Find places" is a step that earns nothing.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !initialInput.trim()) return;
    autoStarted.current = true;
    void runExtract(initialInput);
  }, [initialInput, runExtract]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selected = rows.filter((row) => row.selected);

  const save = async (target: { tripId?: string; destination: string; newTrip?: boolean; title?: string }) => {
    if (!selected.length) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/travel/places/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          places: selected.map((row) => ({
            name: row.name,
            description: row.description,
            category: row.category,
            lat: row.lat,
            lng: row.lng,
          })),
          ...target,
          // Optional on the wire, and only ever an id: the server reads the
          // source link off its own job row rather than trusting this client
          // to say where a place came from.
          ...(result?.importId ? { importId: result.importId } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | (ImportOutcome & { error?: { message?: string } })
        | null;
      if (!response.ok || !body?.tripId) throw new Error(body?.error?.message ?? '');
      setOutcome(body);
      setTripSheetOpen(false);
      setStage('done');
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : lang === 'km'
            ? 'មិនអាចរក្សាទុកបានទេ។ សូមព្យាយាមម្តងទៀត។'
            : 'We could not save those. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-2xl px-4 pb-32 pt-8 sm:px-6">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {t('eyebrow')}
          </p>
          <h1
            className="mt-2 font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            {t('heading')}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">{t('sub')}</p>
        </header>

        {/* One live region for the whole flow, so a screen reader is told what
            state we moved to instead of silently re-rendering underneath it. */}
        <p className="sr-only" role="status" aria-live="polite">
          {stage === 'parsing' ? t('reading') : stage === 'review' ? `${rows.length} ${t('found')}` : ''}
        </p>

        {stage === 'paste' && (
          <PasteStage
            lang={lang}
            t={t}
            input={input}
            setInput={setInput}
            detected={detected}
            error={error}
            onSubmit={() => void runExtract(input)}
          />
        )}

        {stage === 'parsing' && (
          <ParsingStage
            t={t}
            link={detected?.canonicalUrl ?? null}
            platform={detected?.platform ?? null}
            onCancel={() => {
              abortRef.current?.abort();
              setStage('paste');
            }}
          />
        )}

        {stage === 'review' && result && (
          <ReviewStage
            lang={lang}
            t={t}
            result={result}
            rows={rows}
            setRows={setRows}
            error={error}
            onRetry={() => {
              setStage('paste');
              setError(null);
            }}
          />
        )}

        {stage === 'done' && outcome && (
          <DoneStage
            lang={lang}
            t={t}
            outcome={outcome}
            onAgain={() => {
              setInput('');
              setRows([]);
              setResult(null);
              setOutcome(null);
              setStage('paste');
            }}
          />
        )}
      </div>

      {/* The single accent CTA on this surface, docked so it is reachable with a
          thumb on a long list. Only present when there is something to save. */}
      {stage === 'review' && selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary-deep/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setTripSheetOpen(true)}
            className="liquid-glass-accent liquid-press mx-auto flex min-h-[3.25rem] w-full max-w-2xl items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            <Plus size={17} aria-hidden="true" />
            {t('addToPlan')} · {selected.length}
          </button>
        </div>
      )}

      {tripSheetOpen && result && (
        <TripSheet
          lang={lang}
          t={t}
          suggestedDestination={result.destination ?? suggestedFrom(rows)}
          count={selected.length}
          saving={saving}
          error={error}
          onClose={() => setTripSheetOpen(false)}
          onChoose={save}
          initialTripId={initialTripId}
        />
      )}
    </div>
  );
}

/** The country the ticked rows agree on, when they do. */
function suggestedFrom(rows: ReviewRow[]): string | null {
  const countries = new Set(
    rows.filter((row) => row.selected).map((row) => row.country).filter((c): c is string => Boolean(c))
  );
  return countries.size === 1 ? [...countries][0] : null;
}

// ─── Stage 1: paste ──────────────────────────────────────────────────────────

function PasteStage({
  lang,
  t,
  input,
  setInput,
  detected,
  error,
  onSubmit,
}: {
  lang: 'en' | 'km';
  t: (key: keyof typeof COPY) => string;
  input: string;
  setInput: (value: string) => void;
  detected: ReturnType<typeof classifyLink>;
  error: string | null;
  onSubmit: () => void;
}) {
  const [clipboardFailed, setClipboardFailed] = useState(false);

  const readClipboard = async () => {
    setClipboardFailed(false);
    try {
      // Undefined outside a secure context, and rejected without permission.
      if (!navigator.clipboard?.readText) throw new Error('no clipboard');
      const text = await navigator.clipboard.readText();
      if (text.trim()) setInput(text);
    } catch {
      setClipboardFailed(true);
    }
  };

  return (
    <Reveal className="mt-6">
      <div className="night-card p-4 sm:p-5">
        <label htmlFor="import-input" className="block text-sm font-medium text-white/80">
          {t('label')}
        </label>
        <textarea
          id="import-input"
          value={input}
          rows={4}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter submits; Shift+Enter keeps a pasted caption's line breaks.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={t('placeholder')}
          className="mt-2 w-full resize-y rounded-btn border border-white/12 bg-white/[0.04] px-3.5 py-3 text-sm leading-relaxed text-white placeholder:text-white/40 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void readClipboard()}
            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-white/15 px-3.5 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <ClipboardPaste size={15} aria-hidden="true" />
            {t('paste')}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!input.trim()}
            className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            <Sparkles size={16} aria-hidden="true" />
            {t('find')}
          </button>
        </div>

        {clipboardFailed && (
          <p role="alert" className="mt-2 text-xs text-amber-200">
            {lang === 'km'
              ? 'មិនអាចអានក្តារតម្បៀតខ្ទាស់បានទេ។ សូមបិទភ្ជាប់ដោយដៃខាងលើ។'
              : 'We could not read your clipboard. Paste into the box above instead.'}
          </p>
        )}

        {detected && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold-light/30 bg-gold-light/10 px-3 py-1.5 text-xs font-semibold text-gold-light">
            <Link2 size={13} aria-hidden="true" />
            {PLATFORM_LABEL[detected.platform][lang]}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-200">
            {error}
          </p>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label={lang === 'km' ? 'គាំទ្រ' : 'Supported'}>
        {PLATFORM_ORDER.map((platform) => (
          <li
            key={platform}
            className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/60"
          >
            {PLATFORM_LABEL[platform][lang]}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

// ─── Stage 2: parsing ────────────────────────────────────────────────────────

function ParsingStage({
  t,
  link,
  platform,
  onCancel,
}: {
  t: (key: keyof typeof COPY) => string;
  link: string | null;
  platform: LinkPlatform | null;
  onCancel: () => void;
}) {
  const { lang } = useLang();
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      {link && (
        <p className="max-w-full truncate rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 font-mono text-xs text-white/70">
          {link}
        </p>
      )}

      {/* The one ambient moment on this screen. `motion-safe:` is the reduced-
          motion gate: with motion reduced the icon simply sits still, which is
          a calm static state rather than a missing one. */}
      <span className="mt-8 grid h-16 w-16 place-items-center rounded-full border border-gold-light/25 bg-gold-light/10 text-gold-light motion-safe:animate-pulse">
        <Loader2 size={26} aria-hidden="true" className="motion-safe:animate-spin" />
      </span>

      <h2 className="mt-6 font-display text-2xl text-white">{t('reading')}</h2>
      {platform && (
        <p className="mt-1 text-sm text-white/55">{PLATFORM_LABEL[platform][lang]}</p>
      )}
      <p className="mt-3 max-w-sm text-xs leading-relaxed text-white/45">{t('mayBeWrong')}</p>

      <button
        type="button"
        onClick={onCancel}
        className="mt-8 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
      >
        <X size={15} aria-hidden="true" />
        {t('cancel')}
      </button>
    </div>
  );
}

// ─── Stage 3: review ─────────────────────────────────────────────────────────

function ReviewStage({
  lang,
  t,
  result,
  rows,
  setRows,
  error,
  onRetry,
}: {
  lang: 'en' | 'km';
  t: (key: keyof typeof COPY) => string;
  result: ExtractResponse;
  rows: ReviewRow[];
  setRows: (updater: (current: ReviewRow[]) => ReviewRow[]) => void;
  error: string | null;
  onRetry: () => void;
}) {
  const update = (key: string, patch: Partial<ReviewRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  if (rows.length === 0) {
    // Each empty outcome gets its own sentence and its own next step. "No
    // results" for all three would leave a traveler retrying the one thing that
    // cannot work.
    const heading =
      result.outcome === 'caption-unavailable'
        ? t('captionUnavailable')
        : result.outcome === 'link-unreadable'
          ? t('linkUnreadable')
          : t('nothingFound');
    const help =
      result.outcome === 'caption-unavailable'
        ? t('captionUnavailableHelp')
        : result.outcome === 'link-unreadable'
          ? t('linkUnreadableHelp')
          : t('nothingFoundHelp');

    return (
      <Reveal className="night-card mt-6 p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-white/[0.06] text-white/60">
          <MapPin size={20} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-xl text-white">{heading}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/60">{help}</p>
        <button
          type="button"
          onClick={onRetry}
          className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          {t('tryAgain')}
        </button>
      </Reveal>
    );
  }

  return (
    <Reveal className="mt-6">
      {result.preview && (result.preview.title || result.preview.thumbnailUrl) && (
        <div className="night-card flex items-center gap-3 p-3">
          {result.preview.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a remote
            // thumbnail from an arbitrary social CDN; next/image would need
            // every one of those hosts in next.config, which is a config change
            // per platform for a 56px preview.
            <img
              src={result.preview.thumbnailUrl}
              alt=""
              aria-hidden="true"
              className="h-14 w-14 shrink-0 rounded-card object-cover"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            {result.platform && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
                {PLATFORM_LABEL[result.platform][lang]}
              </p>
            )}
            <p className="mt-0.5 line-clamp-2 text-sm text-white/80">
              {result.preview.title ?? result.preview.canonicalUrl}
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-white">
          {rows.length} {t('found')}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: true })))}
            className="min-h-[2.75rem] rounded-btn border border-white/15 px-3 text-xs font-semibold text-white/80 transition-colors hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            {t('selectAll')}
          </button>
          <button
            type="button"
            onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: false })))}
            className="min-h-[2.75rem] rounded-btn border border-white/15 px-3 text-xs font-semibold text-white/80 transition-colors hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            {t('clearAll')}
          </button>
        </div>
      </div>

      {!result.capabilities.model && (
        <p className="mt-2 text-xs leading-relaxed text-white/45">{t('basicMode')}</p>
      )}

      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <li key={row.key}>
            <PlaceRow lang={lang} t={t} row={row} onChange={(patch) => update(row.key, patch)} />
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-sm text-amber-200">
          {error}
        </p>
      )}
    </Reveal>
  );
}

function PlaceRow({
  lang,
  t,
  row,
  onChange,
}: {
  lang: 'en' | 'km';
  t: (key: keyof typeof COPY) => string;
  row: ReviewRow;
  onChange: (patch: Partial<ReviewRow>) => void;
}) {
  const inputId = `place-name-${row.key}`;

  return (
    <div
      className={cn(
        'night-card p-3.5 transition-colors duration-200 ease-smooth',
        row.selected ? 'border-gold-light/35' : 'opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        {/* A real checkbox: it is a checkbox to a screen reader, it toggles with
            Space, and the label is the place name. A styled div would have been
            none of those. */}
        <input
          type="checkbox"
          id={`pick-${row.key}`}
          checked={row.selected}
          onChange={(event) => onChange({ selected: event.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#C69749] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        />

        <div className="min-w-0 flex-1">
          {row.editing ? (
            <>
              <label htmlFor={inputId} className="sr-only">
                {t('edit')}
              </label>
              <input
                id={inputId}
                autoFocus
                value={row.name}
                maxLength={120}
                onChange={(event) => onChange({ name: event.target.value })}
                onBlur={() => onChange({ editing: false })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'Escape') {
                    event.preventDefault();
                    onChange({ editing: false });
                  }
                }}
                className="min-h-[2.75rem] w-full rounded-btn border border-white/15 bg-white/[0.05] px-3 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
              />
            </>
          ) : (
            <label htmlFor={`pick-${row.key}`} className="block cursor-pointer text-sm font-semibold text-white">
              {row.name}
            </label>
          )}

          {row.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/55">{row.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/60">
              {CATEGORY_LABEL[row.category][lang]}
            </span>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px]',
                row.lat !== null ? 'bg-jade/25 text-emerald-100' : 'border border-white/12 text-white/45'
              )}
            >
              {row.lat !== null ? t('onMap') : t('noPin')}
            </span>
            {row.city && (
              <span className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/50">
                {row.city}
              </span>
            )}
          </div>
        </div>

        {!row.editing && (
          <button
            type="button"
            onClick={() => onChange({ editing: true })}
            aria-label={`${t('edit')}: ${row.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <label htmlFor={`cat-${row.key}`} className="sr-only">
        {lang === 'km' ? 'ប្រភេទ' : 'Kind'}
      </label>
      <select
        id={`cat-${row.key}`}
        value={row.category}
        onChange={(event) => onChange({ category: event.target.value as ItineraryCategory })}
        className="mt-2.5 min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] px-3 text-xs text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
      >
        {(['spot', 'food', 'shopping', 'transport', 'stay', 'other'] as ItineraryCategory[]).map(
          (category) => (
            <option key={category} value={category} className="bg-[#142238]">
              {CATEGORY_LABEL[category][lang]}
            </option>
          )
        )}
      </select>
    </div>
  );
}

// ─── The trip picker ─────────────────────────────────────────────────────────

function TripSheet({
  lang,
  t,
  suggestedDestination,
  count,
  saving,
  error,
  onClose,
  onChoose,
  initialTripId,
}: {
  lang: 'en' | 'km';
  t: (key: keyof typeof COPY) => string;
  suggestedDestination: string | null;
  count: number;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChoose: (target: { tripId?: string; destination: string; newTrip?: boolean; title?: string }) => void;
  initialTripId: string | null;
}) {
  const [trips, setTrips] = useState<TripOption[] | null>(null);
  const [destination, setDestination] = useState(suggestedDestination ?? '');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch('/api/travel/trips', { credentials: 'include' });
        const body = (await response.json().catch(() => null)) as { trips?: TripOption[] } | null;
        if (live) setTrips(body?.trips ?? []);
      } catch {
        if (live) setTrips([]);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Escape closes, and focus starts inside the dialog rather than behind it.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trips for the country these places are in come first — that is the one the
  // traveler almost always means, and scrolling past nine others to find it is
  // the difference between two taps and ten.
  const ordered = useMemo(() => {
    if (!trips) return [];
    if (!suggestedDestination) return trips;
    const wanted = suggestedDestination.trim().toLowerCase();
    return [...trips].sort((a, b) => {
      const aMatch = a.destination?.trim().toLowerCase() === wanted ? 1 : 0;
      const bMatch = b.destination?.trim().toLowerCase() === wanted ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [trips, suggestedDestination]);

  const canCreate = destination.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('chooseTrip')}
    >
      <button type="button" aria-label={t('cancel')} className="absolute inset-0 cursor-default" onClick={onClose} />

      <section className="night-card relative max-h-[85vh] w-full overflow-y-auto rounded-b-none rounded-t-[28px] px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />

        <div className="mt-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-white">
            {t('chooseTrip')} <span className="text-white/45">· {count}</span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('cancel')}
            className="grid h-11 w-11 place-items-center rounded-full text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* New trip, first — the reference flow this mirrors puts "create a plan
            for this city" above the list, because someone importing a post
            about a city they have no trip for is the common case. */}
        <div className="mt-4 rounded-card border border-gold-light/25 bg-gold-light/[0.06] p-3.5">
          <label htmlFor="new-trip-destination" className="block text-sm font-medium text-white/80">
            {t('where')}
          </label>
          <input
            id="new-trip-destination"
            value={destination}
            maxLength={80}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={lang === 'km' ? 'ថៃ' : 'Thailand'}
            className="mt-2 min-h-[2.75rem] w-full rounded-btn border border-white/15 bg-white/[0.05] px-3.5 text-sm text-white placeholder:text-white/40 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
          />
          <button
            type="button"
            disabled={!canCreate || saving}
            onClick={() => onChoose({ destination: destination.trim(), newTrip: true })}
            className="liquid-glass-accent liquid-press mt-3 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            {saving ? <Loader2 size={15} aria-hidden="true" className="motion-safe:animate-spin" /> : <Plus size={15} aria-hidden="true" />}
            {t('createNow')}
          </button>
        </div>

        {trips === null ? (
          <p className="mt-5 text-sm text-white/50">{lang === 'km' ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
        ) : (
          <ul className="mt-5 space-y-2">
            {ordered.map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onChoose({ tripId: trip.id, destination: trip.destination })}
                  className={cn(
                    'flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-card border px-3.5 py-3 text-left transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light disabled:opacity-50',
                    trip.id === initialTripId
                      ? 'border-gold-light/40 bg-gold-light/[0.08]'
                      : 'border-white/12 hover:border-gold-light/30'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{trip.title}</span>
                    <span className="block truncate text-xs text-white/50">{trip.destination}</span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-white/40" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-amber-200">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Stage 4: done ───────────────────────────────────────────────────────────

function DoneStage({
  lang,
  t,
  outcome,
  onAgain,
}: {
  lang: 'en' | 'km';
  t: (key: keyof typeof COPY) => string;
  outcome: ImportOutcome;
  onAgain: () => void;
}) {
  return (
    <Reveal className="night-card mt-6 p-6 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold-light/12 text-gold-light">
        <Check size={24} aria-hidden="true" />
      </span>

      <h2 className="mt-4 font-display text-2xl text-white">
        {outcome.added.length} {t('saved')}
      </h2>
      <p className="mt-1 text-sm text-white/60">{outcome.tripTitle}</p>

      {/* Skipped and failed are stated, not hidden. A traveler who ticked nine
          and sees "7 saved" needs to know the other two were already there. */}
      {outcome.skipped.length > 0 && (
        <p className="mt-3 text-xs text-white/45">
          {outcome.skipped.length} {t('alreadyThere')}
        </p>
      )}
      {outcome.failed.length > 0 && (
        <p role="alert" className="mt-1 text-xs text-amber-200">
          {outcome.failed.length} {t('couldNotSave')}
        </p>
      )}

      <div className="mt-6 space-y-2">
        <Link
          href={`/trips/${outcome.tripId}/itinerary`}
          className="liquid-glass-accent liquid-press flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          {t('openItinerary')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link
          href={`/trips/${outcome.tripId}`}
          className="flex min-h-[2.75rem] w-full items-center justify-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-gold-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          {t('openTrip')}
        </Link>
        <button
          type="button"
          onClick={onAgain}
          className="flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-btn px-5 text-sm font-semibold text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <Plus size={15} aria-hidden="true" />
          {t('importAnother')}
        </button>
      </div>

      <p className="sr-only">{lang === 'km' ? 'រួចរាល់' : 'Done'}</p>
    </Reveal>
  );
}
