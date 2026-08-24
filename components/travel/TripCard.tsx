'use client';

// TripCard — one trip, on the night surface, with its readiness visible.
//
// Used by /trips. The dates and the progress are on the card itself because
// "which trip is this and is it sorted?" is the only question a list of trips
// has to answer.
//
// The card is a full-bleed click target — tapping anywhere opens the trip —
// but a nested <button> inside an <a> is invalid HTML and unreliable for
// keyboard and screen-reader users. So the Link is the stretched, invisible
// layer: it sits UNDER the visible content, which is marked
// `pointer-events-none` so every click falls through to it, except the delete
// button, which opts back into pointer-events and therefore wins the hit test
// wherever it is drawn. Nothing here is layered by z-index; it is ordinary
// paint order plus one CSS property.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarRange, Loader2, Trash2, Users } from 'lucide-react';
import { readinessPercent, type TripSummary } from '@/lib/travel/state';
import { StatusBadge } from './StatusBadge';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function formatRange(start: string | null, end: string | null, lang: 'en' | 'km'): string {
  if (!start) return lang === 'km' ? 'មិនទាន់កំណត់ថ្ងៃ' : 'Dates not set';
  const locale = lang === 'km' ? 'km-KH' : 'en-GB';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const from = new Date(`${start}T00:00:00Z`).toLocaleDateString(locale, opts);
  if (!end || end === start) return from;
  const to = new Date(`${end}T00:00:00Z`).toLocaleDateString(locale, opts);
  return `${from} → ${to}`;
}

export function TripCard({
  trip,
  /** 'upcoming' | 'now' | 'past' — decides the badge, not the layout. */
  phase,
  index = 0,
  className,
  /**
   * Present only where the caller can actually remove the trip from its own
   * list afterward. Omit it and the card renders exactly as it always has —
   * the delete affordance is opt-in per screen, not a property of every trip.
   */
  onDelete,
}: {
  trip: TripSummary;
  phase: 'upcoming' | 'now' | 'past';
  index?: number;
  className?: string;
  onDelete?: (tripId: string) => void;
}) {
  const { lang } = useLang();
  const percent = readinessPercent(trip.readiness);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const badge =
    phase === 'now'
      ? { tone: 'urgent' as const, label: lang === 'km' ? 'កំពុងធ្វើដំណើរ' : 'Travelling', dot: true }
      : phase === 'past'
        ? { tone: 'quiet' as const, label: lang === 'km' ? 'បានបញ្ចប់' : 'Past', dot: false }
        : { tone: 'info' as const, label: lang === 'km' ? 'ខាងមុខ' : 'Upcoming', dot: false };

  async function confirmDelete() {
    setDeleting(true);
    setError(false);
    try {
      const response = await fetch(`/api/travel/trips/${trip.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('delete failed');
      onDelete?.(trip.id);
      // No need to reset `deleting` on success — the parent removes this card
      // from the list, so there is nothing left to render into.
    } catch {
      setDeleting(false);
      setError(true);
    }
  }

  return (
    <div
      className={cn('night-card deck-item interaction-card group relative block p-5', className)}
      style={{ '--deck-index': index } as React.CSSProperties}
    >
      {!confirming && (
        <Link
          href={`/trips/${trip.id}`}
          aria-label={`${trip.destination} — ${trip.title}`}
          className="absolute inset-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        />
      )}

      {/* `relative` is load-bearing, not decorative: an absolutely-positioned
          sibling paints above ordinary in-flow content regardless of DOM
          order or pointer-events, so without this the Link sat on top of
          everything — including the delete button — and swallowed every
          click meant for it. */}
      <div className={cn('relative', confirming ? undefined : 'pointer-events-none')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
              {trip.flag ? `${trip.flag} ` : ''}
              {trip.destination}
            </p>
            <h3 className="mt-1 truncate font-display text-xl text-white">{trip.title}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge tone={badge.tone} dot={badge.dot}>
              {badge.label}
            </StatusBadge>
            {onDelete && !confirming && (
              <button
                type="button"
                aria-label={lang === 'km' ? 'លុបដំណើរនេះ' : 'Delete this trip'}
                onClick={(event) => {
                  // The Link is a sibling underneath, not an ancestor, so
                  // preventDefault/stopPropagation are not what keep this from
                  // navigating — pointer-events is. This still guards against
                  // the click bubbling to anything else listening on the card.
                  event.preventDefault();
                  event.stopPropagation();
                  setConfirming(true);
                }}
                className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/45 transition-colors duration-200 ease-smooth hover:bg-danger/15 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/65">
          <div className="flex items-center gap-1.5">
            <CalendarRange size={14} aria-hidden="true" />
            <dt className="sr-only">{lang === 'km' ? 'ថ្ងៃ' : 'Dates'}</dt>
            <dd className="font-mono">{formatRange(trip.startDate, trip.endDate, lang)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} aria-hidden="true" />
            <dt className="sr-only">{lang === 'km' ? 'អ្នកដំណើរ' : 'Travellers'}</dt>
            <dd>{trip.travelers}</dd>
          </div>
        </dl>

        {phase !== 'past' && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-white/50">
              <span>{lang === 'km' ? 'ការរៀបចំ' : 'Ready'}</span>
              <span className="font-mono">{percent}%</span>
            </div>
            <div className="capsule-meter mt-1.5 text-gold-light" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {confirming ? (
          <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <p className="mr-auto text-sm text-white/70">
              {lang === 'km' ? 'លុបដំណើរនេះឬ?' : 'Delete this trip?'}
            </p>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="liquid-press inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-btn bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {deleting && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {lang === 'km' ? 'លុប' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="inline-flex min-h-[2.25rem] items-center rounded-btn border border-white/15 px-4 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              {lang === 'km' ? 'បោះបង់' : 'Cancel'}
            </button>
          </div>
        ) : (
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gold-bright">
            {lang === 'km' ? 'បើកដំណើរ' : 'Open trip'}
            <ArrowUpRight
              size={14}
              aria-hidden="true"
              className="transition-transform duration-300 ease-smooth group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        )}

        {error && (
          <p role="alert" className="pointer-events-auto mt-2 text-sm text-danger">
            {lang === 'km' ? 'លុបមិនបាន។ សូមព្យាយាមម្ដងទៀត។' : 'Could not delete. Please try again.'}
          </p>
        )}
      </div>
    </div>
  );
}
