'use client';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationCard — one update, rendered for what it actually is.
//
// The card is a link, always, and it goes to the exact screen the update is
// about (the deep link was decided server-side by the catalogue, so this
// component never has to work it out). Tapping marks it read optimistically:
// the traveler has read it by definition, and waiting for a round trip to grey
// it out makes the app feel slower than the network.
//
// TWO KINDS GET A PURPOSE-BUILT BODY rather than a second line of prose,
// because for these the number *is* the message:
//
//   • eSIM data   → a dot meter. You count the dark dots without meaning to,
//                   which is faster than parsing "1.4 GB of 5 GB remaining".
//   • weather     → an hour strip. "Rain this afternoon" makes you go and look;
//                   4PM 5PM 6PM 7PM with the wet ones marked answers the real
//                   question inside the notification.
//
// Both read their data from `metadata`, and both are skipped silently when the
// sender did not provide it. A card must never look broken because a job sent
// less than it could have.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  Bell,
  BedDouble,
  ChartNoAxesColumn,
  CircleAlert,
  Clock,
  CloudRain,
  Compass,
  DoorOpen,
  Info,
  ListChecks,
  MapPin,
  OctagonAlert,
  PlaneLanding,
  PlaneTakeoff,
  QrCode,
  Signal,
  SignalLow,
  Sparkles,
  Tag,
  TicketCheck,
  TriangleAlert,
  CalendarClock,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react';
import { NOTIFICATION_KINDS, toneForLevel, type NotificationLevel } from '@/lib/notifications/catalog';
import { DotMeter } from '@/components/travel/DotMeter';
import { HourStrip, type Hour } from '@/components/travel/HourStrip';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface InboxNotification {
  id: string;
  category: string;
  kind: string;
  level: NotificationLevel;
  title: string;
  body: string | null;
  deep_link: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const TONE_RING: Record<ReturnType<typeof toneForLevel>, string> = {
  urgent: 'border-gold-light/45 bg-accent/18 text-gold-bright',
  warning: 'border-warning/40 bg-warning/12 text-[#FCD34D]',
  info: 'border-[#57C8FF]/35 bg-[#57C8FF]/10 text-[#8FD8FF]',
  quiet: 'border-white/12 bg-white/5 text-white/60',
};

/**
 * The catalogue's icon names, resolved to components.
 *
 * Written out rather than looked up with `import * as Icons` — a namespace
 * import defeats tree-shaking and pulled the entire lucide-react set into this
 * route, taking it from ~15 kB to 163 kB of JavaScript. Adding a kind to the
 * catalogue means adding one line here, and the fallback covers the gap until
 * someone does.
 */
const ICONS: Record<string, LucideIcon> = {
  BedDouble,
  CalendarClock,
  ChartNoAxesColumn,
  CircleAlert,
  Clock,
  CloudRain,
  Compass,
  DoorOpen,
  Info,
  ListChecks,
  MapPin,
  OctagonAlert,
  PlaneLanding,
  PlaneTakeoff,
  QrCode,
  Signal,
  SignalLow,
  Sparkles,
  Tag,
  TicketCheck,
  TriangleAlert,
};

function iconFor(kind: string): LucideIcon {
  const name = (NOTIFICATION_KINDS as Record<string, { icon: string } | undefined>)[kind]?.icon;
  return (name ? ICONS[name] : undefined) ?? Bell;
}

function relativeTime(iso: string, lang: 'en' | 'km'): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return lang === 'km' ? 'ឥឡូវនេះ' : 'now';
  if (minutes < 60) return lang === 'km' ? `${minutes} នាទីមុន` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === 'km' ? `${hours} ម៉ោងមុន` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return lang === 'km' ? `${days} ថ្ងៃមុន` : `${days}d ago`;
}

/** Percentage remaining, when the sender told us. Never inferred. */
function remainingPercent(metadata: Record<string, unknown> | null | undefined): number | null {
  const value = metadata?.remainingPercent;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Forecast hours, when the sender told us. Shape-checked, never trusted blind. */
function forecastHours(metadata: Record<string, unknown> | null | undefined): Hour[] | null {
  const value = metadata?.hours;
  if (!Array.isArray(value)) return null;
  const hours = value.filter(
    (entry): entry is Hour =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Hour).label === 'string' &&
      typeof (entry as Hour).temperatureC === 'number' &&
      typeof (entry as Hour).code === 'number'
  );
  return hours.length > 0 ? hours.slice(0, 8) : null;
}

export function NotificationCard({
  notification,
  onRead,
  onClear,
  index = 0,
}: {
  notification: InboxNotification;
  onRead: (id: string) => void;
  onClear?: (id: string) => void;
  index?: number;
}) {
  const { lang } = useLang();
  const tone = toneForLevel(notification.level);
  const Icon = iconFor(notification.kind);
  const unread = notification.read_at === null;

  const percent = remainingPercent(notification.metadata);
  const hours = forecastHours(notification.metadata);
  const peakIndex = typeof notification.metadata?.peakHourIndex === 'number'
    ? (notification.metadata.peakHourIndex as number)
    : undefined;

  return (
    <div
      className={cn(
        'deck-item group relative rounded-card border transition-colors duration-200 ease-smooth',
        unread
          ? 'border-white/12 bg-[#0b1424]/95 hover:border-gold-light/35'
          : 'border-white/8 bg-[#0b1424]/70 hover:border-white/20'
      )}
      style={{ '--deck-index': index } as React.CSSProperties}
    >
      <Link
        href={notification.deep_link}
        onClick={() => unread && onRead(notification.id)}
        className="flex gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-light rounded-card"
      >
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
            TONE_RING[tone]
          )}
          aria-hidden="true"
        >
          <Icon size={16} strokeWidth={2.2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={cn('truncate font-semibold', unread ? 'text-white' : 'text-white/70')}>
              {notification.title}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-white/45">
              {relativeTime(notification.created_at, lang)}
            </span>
          </span>

          {notification.body && (
            <span className="mt-0.5 block text-sm leading-relaxed text-white/65">
              {notification.body}
            </span>
          )}

          {/* The number as a shape. Paired with the text above, which is what a
              screen reader gets — the meter itself is aria-hidden. */}
          {percent !== null && (
            <span className="mt-2.5 block text-gold-light">
              <DotMeter percent={percent} total={20} animate={unread} />
            </span>
          )}

          {hours && <HourStrip hours={hours} peakIndex={peakIndex} className="mt-2.5" />}
        </span>

        {unread && (
          <>
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="sr-only">{lang === 'km' ? 'មិនទាន់អាន' : 'Unread'}</span>
          </>
        )}
      </Link>

      {/* The keyboard and screen-reader path to everything swipe does. Visible
          on hover and whenever focused, never hidden behind a gesture — a
          gesture-only affordance is an inaccessible one. */}
      <div className="flex items-center gap-1 px-4 pb-2.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 hover:opacity-100 sm:absolute sm:bottom-1.5 sm:right-2 sm:px-0 sm:pb-0">
        {unread && (
          <button
            type="button"
            onClick={() => onRead(notification.id)}
            className="flex min-h-[2.25rem] items-center gap-1 rounded-btn px-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/50 transition-colors hover:bg-white/8 hover:text-[#6EE7B7] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <Check size={13} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{lang === 'km' ? 'បានអាន' : 'Read'}</span>
          </button>
        )}
        {onClear && (
          <button
            type="button"
            onClick={() => onClear(notification.id)}
            className="flex min-h-[2.25rem] items-center gap-1 rounded-btn px-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/50 transition-colors hover:bg-white/8 hover:text-[#FCA5A5] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            aria-label={`${lang === 'km' ? 'លុប' : 'Clear'}: ${notification.title}`}
          >
            <X size={13} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{lang === 'km' ? 'លុប' : 'Clear'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
