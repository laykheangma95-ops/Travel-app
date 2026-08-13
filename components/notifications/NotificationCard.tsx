'use client';

// NotificationCard — one row in the Domner Inbox.
//
// It is a link, always, and it goes to the exact screen the notification is
// about (the deep link was decided server-side by the catalogue, so this
// component never has to work it out). Tapping marks it read optimistically:
// the traveler has read it by definition, and waiting for a round trip to grey
// it out makes the app feel slower than the network.

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
  type LucideIcon,
} from 'lucide-react';
import { NOTIFICATION_KINDS, toneForLevel, type NotificationLevel } from '@/lib/notifications/catalog';
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

export function NotificationCard({
  notification,
  onRead,
  index = 0,
}: {
  notification: InboxNotification;
  onRead: (id: string) => void;
  index?: number;
}) {
  const { lang } = useLang();
  const tone = toneForLevel(notification.level);
  const Icon = iconFor(notification.kind);
  const unread = notification.read_at === null;

  return (
    <Link
      href={notification.deep_link}
      onClick={() => unread && onRead(notification.id)}
      className={cn(
        'deck-item flex gap-3 rounded-card border p-4 transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
        unread
          ? 'border-white/12 bg-white/[0.055] hover:border-gold-light/35'
          : 'border-white/8 bg-white/[0.02] hover:border-white/20'
      )}
      style={{ '--deck-index': index } as React.CSSProperties}
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
          <span className="mt-0.5 block text-sm leading-relaxed text-white/65">{notification.body}</span>
        )}
      </span>

      {unread && (
        <>
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span className="sr-only">{lang === 'km' ? 'មិនទាន់អាន' : 'Unread'}</span>
        </>
      )}
    </Link>
  );
}
