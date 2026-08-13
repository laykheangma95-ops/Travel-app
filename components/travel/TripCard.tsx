'use client';

// TripCard — one trip, on the night surface, with its readiness visible.
//
// Used by /trips and by the Home deck. The dates and the progress are on the
// card itself because "which trip is this and is it sorted?" is the only
// question a list of trips has to answer.

import Link from 'next/link';
import { ArrowUpRight, CalendarRange, Users } from 'lucide-react';
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
}: {
  trip: TripSummary;
  phase: 'upcoming' | 'now' | 'past';
  index?: number;
  className?: string;
}) {
  const { lang } = useLang();
  const percent = readinessPercent(trip.readiness);

  const badge =
    phase === 'now'
      ? { tone: 'urgent' as const, label: lang === 'km' ? 'កំពុងធ្វើដំណើរ' : 'Travelling', dot: true }
      : phase === 'past'
        ? { tone: 'quiet' as const, label: lang === 'km' ? 'បានបញ្ចប់' : 'Past', dot: false }
        : { tone: 'info' as const, label: lang === 'km' ? 'ខាងមុខ' : 'Upcoming', dot: false };

  return (
    <Link
      href={`/trips/${trip.id}`}
      className={cn('night-card deck-item group block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light', className)}
      style={{ '--deck-index': index } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {trip.flag ? `${trip.flag} ` : ''}
            {trip.destination}
          </p>
          <h3 className="mt-1 truncate font-display text-xl text-white">{trip.title}</h3>
        </div>
        <StatusBadge tone={badge.tone} dot={badge.dot}>
          {badge.label}
        </StatusBadge>
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

      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gold-bright">
        {lang === 'km' ? 'បើកដំណើរ' : 'Open trip'}
        <ArrowUpRight
          size={14}
          aria-hidden="true"
          className="transition-transform duration-300 ease-smooth group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </span>
    </Link>
  );
}
