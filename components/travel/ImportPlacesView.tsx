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
//
// The review list, one place row, and the trip picker used to live in this
// file. They now live in PlaceImportReview.tsx, shared with the queued-link
// pipeline (SocialLinkIntake, Phase 5) — see that file's header for why. This
// file keeps the paste box, the "reading…" state and the "done" screen, which
// are specific to this synchronous pipeline.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { Reveal } from '@/components/ui/Reveal';
import { classifyLink, firstUrlIn, PLATFORM_LABEL, type LinkPlatform } from '@/lib/travel/socialLink';
import { AUTO_SELECT_CONFIDENCE, type PlaceCandidate } from '@/lib/travel/placeExtraction';
import { COPY, type Translate } from './placeImportCopy';
import { ReviewStage, TripSheet, suggestedFrom, type ReviewRow } from './PlaceImportReview';

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

interface ImportOutcome {
  tripId: string;
  tripTitle: string;
  createdTrip: boolean;
  added: string[];
  skipped: string[];
  failed: string[];
}

const PLATFORM_ORDER: LinkPlatform[] = ['tiktok', 'instagram', 'facebook', 'youtube', 'google-maps'];

export function ImportPlacesView({
  initialInput = '',
  initialTripId = null,
}: {
  initialInput?: string;
  initialTripId?: string | null;
}) {
  const { lang } = useLang();
  const t: Translate = useCallback((key) => COPY[key][lang], [lang]);

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
  t: Translate;
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
  t: Translate;
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

// ─── Stage 4: done ───────────────────────────────────────────────────────────

function DoneStage({
  lang,
  t,
  outcome,
  onAgain,
}: {
  lang: 'en' | 'km';
  t: Translate;
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
