'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The review list, one place row, and the trip picker — extracted out of
// ImportPlacesView.tsx (the synchronous /import pipeline) so the queued-link
// pipeline (SocialLinkIntake, Phase 5) can reach the same review experience
// instead of a second implementation of it.
//
// BEHAVIOR-PRESERVING EXTRACTION. Nothing about what these three components
// render or how they behave changed when they moved here — same markup, same
// classes, same event handling, same accessibility. The only change is that
// `ReviewStage` now takes a `PlaceReviewResult` (outcome/preview/platform/
// capabilities) instead of the /import pipeline's own `ExtractResponse`
// specifically: every field ExtractResponse has that ReviewStage actually
// reads, `PlaceReviewResult` also has, so ExtractResponse still satisfies it
// structurally and ImportPlacesView needed no change beyond its imports. That
// is what lets a queued job's GET /api/imports/:id response — a different
// shape, built for a different request — feed the exact same component.
//
// DoneStage moves here too, alongside ImportOutcome (the shape
// POST /api/travel/places/import always returns, regardless of which flow
// called it) — both pipelines end on the identical "saved" screen, so it is
// exactly as shared as TripSheet. ImportPlacesView.tsx keeps only PasteStage
// and ParsingStage, which really are specific to its own paste box and
// "reading…" state; SocialLinkIntake owns the queued flow's equivalents for
// those two.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Loader2, MapPin, Pencil, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/ui/Reveal';
import { SavedPlaceButton } from '@/components/travel/SavedPlaceButton';
import { CATEGORY_LABEL, type ItineraryCategory } from '@/lib/travel/itinerary';
import { PLATFORM_LABEL, type LinkPlatform } from '@/lib/travel/socialLink';
import type { PlaceCandidate } from '@/lib/travel/placeExtraction';
import { importOutcomeStatus, viewPlaceHref, type ImportOutcome } from '@/lib/travel/importOutcome';
import type { PlaceResolutionSummary } from '@/lib/travel/placeImport';
import type { CopyKey, Translate } from './placeImportCopy';

/** A candidate plus the state the review list keeps about it. */
export interface ReviewRow extends PlaceCandidate {
  key: string;
  selected: boolean;
  editing: boolean;
}

export interface TripOption {
  id: string;
  title: string;
  destination: string;
  start_date?: string | null;
  end_date?: string | null;
}

/**
 * Exactly what ReviewStage needs to render the preview card and pick the
 * empty-state sentence. Any result object with these fields works — the
 * synchronous pipeline's `ExtractResponse` has more fields on top (candidates,
 * destination, importId, reused) that ReviewStage never reads, and a queued
 * job's GET response can be mapped onto this shape without inventing fields
 * it does not have.
 */
export interface PlaceReviewResult {
  outcome: 'ok' | 'no-places-found' | 'caption-unavailable' | 'link-unreadable';
  platform: LinkPlatform | null;
  preview: {
    title: string | null;
    author: string | null;
    thumbnailUrl: string | null;
    canonicalUrl: string | null;
  } | null;
  capabilities: { model: boolean; geocoding: boolean };
}

// ImportOutcome and viewPlaceHref live in lib/travel/importOutcome.ts — a
// plain .ts module, not here — so a regression test can import them without
// this file's JSX ever needing to parse (see that module's own header).
// Re-exported so existing imports of ImportOutcome from this file (
// ImportPlacesView.tsx, SocialLinkIntake.tsx) need no change.
export { viewPlaceHref };
export type { ImportOutcome };

/** The country the ticked rows agree on, when they do. */
export function suggestedFrom(rows: ReviewRow[]): string | null {
  const countries = new Set(
    rows.filter((row) => row.selected).map((row) => row.country).filter((c): c is string => Boolean(c))
  );
  return countries.size === 1 ? [...countries][0] : null;
}

// ─── The review list ─────────────────────────────────────────────────────────

export function ReviewStage({
  lang,
  t,
  result,
  rows,
  setRows,
  error,
  onRetry,
}: {
  lang: 'en' | 'km';
  t: Translate;
  result: PlaceReviewResult;
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

// ─── One place row ───────────────────────────────────────────────────────────

export function PlaceRow({
  lang,
  t,
  row,
  onChange,
}: {
  lang: 'en' | 'km';
  t: Translate;
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

export function TripSheet({
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
  t: Translate;
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

// ─── Phase 13: canonical-resolution confirmation ────────────────────────────
//
// Rendered on the "saved" screen, never before — the trip save has already
// happened by the time a traveler sees this, and ignoring the question
// entirely (closing the tab, tapping "Import another") leaves the place
// exactly as it is: on the trip, canonical_place_id still null. This is a
// self-contained fetcher, the same pattern SavedPlaceButton already uses: it
// owns its own request and its own busy/error state, and tells its parent the
// outcome through one callback rather than the parent driving the fetch.

type ResolutionRequestState = 'idle' | 'busy' | 'error';

function ResolutionConfirm({
  t,
  destinationPlaceId,
  resolution,
  onResolved,
}: {
  t: Translate;
  destinationPlaceId: string;
  resolution: PlaceResolutionSummary;
  /** null = the traveler rejected every option (kept as their own place); a
   *  string = the canonical id that ended up attached. */
  onResolved: (canonicalPlaceId: string | null) => void;
}) {
  const [state, setState] = useState<ResolutionRequestState>('idle');
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const decide = async (decision: 'confirmed' | 'rejected' | 'corrected', correctedPlaceId?: string) => {
    if (state === 'busy') return;
    setState('busy');
    try {
      const response = await fetch(`/api/travel/destination-places/${destinationPlaceId}/resolution`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(correctedPlaceId ? { correctedPlaceId } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as { canonicalPlaceId?: string | null } | null;
      if (!live.current) return;
      if (!response.ok) {
        setState('error');
        return;
      }
      // Every outcome — applied, or the registry moving on under us
      // (`outcome: 'no-proposal'`) — collapses this card. The traveler asked
      // a question and got an answer either way; there is nothing left for
      // them to do here.
      onResolved(body?.canonicalPlaceId ?? null);
    } catch {
      if (live.current) setState('error');
    }
  };

  const candidates = [resolution.proposed, ...resolution.alternatives];
  const away = (meters: number) => t('resolutionAway').replace('{n}', String(Math.round(meters)));

  return (
    <div className="mt-3 rounded-card border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-white/60">
        {resolution.alternatives.length > 0 ? t('resolutionWhichOne') : t('resolutionQuestion')}
      </p>

      {resolution.alternatives.length === 0 ? (
        <>
          <div className="mt-2 flex items-start gap-2">
            <MapPin size={14} className="mt-0.5 flex-none text-gold-light" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{resolution.proposed.name}</p>
              {(resolution.proposed.address || resolution.proposed.city) && (
                <p className="truncate text-xs text-white/50">
                  {resolution.proposed.address ?? resolution.proposed.city}
                </p>
              )}
              <p className="text-[11px] text-white/35">{away(resolution.proposed.meters)}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={state === 'busy'}
              onClick={() => void decide('confirmed')}
              className="liquid-glass-accent liquid-press min-h-[2.5rem] flex-1 rounded-btn px-3 text-xs font-semibold text-primary-deep disabled:opacity-60"
            >
              {t('resolutionThatsIt')}
            </button>
            <button
              type="button"
              disabled={state === 'busy'}
              onClick={() => void decide('rejected')}
              className="min-h-[2.5rem] flex-1 rounded-btn border border-white/15 px-3 text-xs font-semibold text-white/75 transition-colors hover:border-gold-light/40 disabled:opacity-60"
            >
              {t('resolutionNotThisPlace')}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-2 space-y-1.5">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              disabled={state === 'busy'}
              onClick={() =>
                void decide(
                  candidate.id === resolution.proposed.id ? 'confirmed' : 'corrected',
                  candidate.id === resolution.proposed.id ? undefined : candidate.id
                )
              }
              className="flex w-full min-h-[2.75rem] items-center justify-between gap-2 rounded-btn border border-white/12 bg-white/[0.03] px-3 text-left text-xs text-white/85 transition-colors hover:border-gold-light/40 disabled:opacity-60"
            >
              <span className="min-w-0 truncate">
                {candidate.name}
                {candidate.city ? ` · ${candidate.city}` : ''}
              </span>
              <span className="flex-none text-[11px] text-white/40">{away(candidate.meters)}</span>
            </button>
          ))}
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => void decide('rejected')}
            className="flex w-full min-h-[2.5rem] items-center justify-center rounded-btn px-3 text-xs font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-60"
          >
            {t('resolutionNoneOfThese')}
          </button>
        </div>
      )}

      {state === 'error' && (
        <p role="alert" className="mt-2 text-xs text-amber-200">
          {t('resolutionFailed')}
        </p>
      )}
    </div>
  );
}

// ─── The "saved" screen ──────────────────────────────────────────────────────

export function DoneStage({
  lang,
  t,
  outcome,
  importId,
  returnTo,
  onAgain,
}: {
  lang: 'en' | 'km';
  t: Translate;
  outcome: ImportOutcome;
  /**
   * The import this batch came from, when the caller has one. Threaded
   * through to each place's SavedPlaceButton as provenance — the caller
   * already holds this value (it is the same id the save request itself just
   * sent), so this is not a new lookup, only a new prop.
   */
  importId: string | null;
  /** Where a heart's sign-in link should return to — the page DoneStage is mounted on. */
  returnTo: string;
  onAgain: () => void;
}) {
  // Phase 13. `outcome` is the server's answer at the moment of the save —
  // immutable for the life of this render. A traveler's confirm/reject/correct
  // tap happens after that, so its result is tracked here rather than by
  // mutating `outcome`: undefined = still awaiting a decision, null = the
  // traveler kept it as their own (rejected, or nothing survived), a string =
  // the canonical id the decision actually attached.
  const [resolved, setResolved] = useState<Record<string, string | null>>({});

  // Phase 13.5: the headline must never claim a save that did not happen.
  // Zero added and at least one failed is a failure state, not the same green
  // check a full batch gets — see lib/travel/importOutcome.ts's
  // importOutcomeStatus.
  const status = importOutcomeStatus(outcome);

  return (
    <Reveal className="night-card mt-6 p-6 text-center">
      <span
        className={cn(
          'mx-auto grid h-14 w-14 place-items-center rounded-full',
          status === 'failure' ? 'bg-amber-500/15 text-amber-200' : 'bg-gold-light/12 text-gold-light'
        )}
      >
        {status === 'failure' ? (
          <AlertTriangle size={24} aria-hidden="true" />
        ) : (
          <Check size={24} aria-hidden="true" />
        )}
      </span>

      <h2 className="mt-4 font-display text-2xl text-white">
        {status === 'failure'
          ? t('nothingSaved')
          : status === 'partial'
            ? `${outcome.added.length} ${t('addedLabel')} · ${outcome.failed.length} ${t('needsAttention')}`
            : `${outcome.added.length} ${t('saved')}`}
      </h2>
      <p className="mt-1 text-sm text-white/60">{outcome.tripTitle}</p>

      {/* Skipped and failed are stated, not hidden. A traveler who ticked nine
          and sees "7 saved" needs to know the other two were already there. */}
      {outcome.skipped.length > 0 && (
        <p className="mt-3 text-xs text-white/45">
          {outcome.skipped.length} {t('alreadyThere')}
        </p>
      )}
      {/* Phase 13.5: each failed place with its own reason, not a bare count —
          the backend now classifies why (lib/travel/placeImport.ts's
          classifyImportFailure) instead of the loop's old bare `catch`. */}
      {outcome.failedPlaces.length > 0 && (
        <ul className="mt-3 space-y-1 text-left" aria-label={t('couldNotSave')}>
          {outcome.failedPlaces.map((place, index) => (
            <li
              key={`${place.name}-${index}`}
              role="alert"
              className="rounded-card border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
            >
              {place.message}
            </li>
          ))}
        </ul>
      )}

      {/* Every place actually written, own row each — not only the "exactly
          one place" case viewPlaceHref covers. A place that never resolved to
          a canonical id (no coordinates, a registry miss) still shows its
          name; it just gets no View-place link and no heart, because there is
          nothing to save a library bookmark AGAINST. The heart is SavedPlaceButton,
          unchanged — the same component /place/[id] and /you/saved already
          mount — so hearting here is a real library save, not a preview of one. */}
      {outcome.addedPlaces.length > 0 && (
        <ul className="mt-5 space-y-2 text-left" aria-label={t('saved')}>
          {outcome.addedPlaces.map((place, index) => {
            // A decision made in THIS render session overrides the server's
            // original answer; before any decision, the server's own
            // canonicalPlaceId (already attached when resolution was 'auto',
            // per lib/travel/placeImport.ts) stands.
            const decided = resolved[place.destinationPlaceId];
            const canonicalPlaceId = decided !== undefined ? decided : place.canonicalPlaceId;

            return (
              <li key={`${place.name}-${index}`} className="night-card rounded-card p-3">
                <p className="text-sm font-semibold text-white">{place.name}</p>
                {canonicalPlaceId && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/place/${canonicalPlaceId}`}
                      className="text-xs font-semibold text-gold-light hover:text-gold-bright"
                    >
                      {t('viewPlace')}
                    </Link>
                    <SavedPlaceButton
                      placeId={canonicalPlaceId}
                      placeName={place.name}
                      initialSaved={false}
                      returnTo={returnTo}
                      sourceImportId={importId}
                    />
                  </div>
                )}
                {/* Phase 13: an ambiguous proposal, not yet decided. Never
                    shown once `decided` holds any value (including null —
                    the traveler already said "not this place"). */}
                {!canonicalPlaceId && place.resolution && decided === undefined && (
                  <ResolutionConfirm
                    t={t}
                    destinationPlaceId={place.destinationPlaceId}
                    resolution={place.resolution}
                    onResolved={(id) => setResolved((current) => ({ ...current, [place.destinationPlaceId]: id }))}
                  />
                )}
                {decided === null && <p className="mt-2 text-xs text-white/45">{t('resolutionKept')}</p>}
              </li>
            );
          })}
        </ul>
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

// Re-exported so a consumer only needs one import for the copy key type.
export type { CopyKey };
