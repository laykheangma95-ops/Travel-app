'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The Live Island — one surface for the one thing happening now.
//
// The idea it borrows is not the shape, it is the *promise*: there is exactly
// one place on the screen where the live thing lives, and it changes size
// rather than being replaced. A traveler learns that spot once and never has to
// look anywhere else.
//
// So this is deliberately singular. It shows the single most urgent unread
// notification — never a list, never a carousel. If two things are urgent, the
// higher-priority, more recent one wins and the other is a card below. A second
// island would destroy the only property that makes the first one useful.
//
// Collapsed it is a pill: dot, one line, a time. Tapped it morphs into a card
// with the body and its action. framer-motion's `layout` does the morph, so the
// pill genuinely *becomes* the card — no cross-fade between two components,
// which is what makes it read as one object rather than two.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { InboxNotification } from './NotificationCard';
import { toneForLevel } from '@/lib/notifications/catalog';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// One spring, shared by every part of the morph, so the pill and its contents
// arrive together instead of racing.
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.9 };

function relativeTime(iso: string, lang: 'en' | 'km'): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return lang === 'km' ? 'ឥឡូវ' : 'now';
  if (minutes < 60) return lang === 'km' ? `${minutes} នាទី` : `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === 'km' ? `${hours} ម៉ោង` : `${hours}h`;
  return lang === 'km' ? `${Math.round(hours / 24)} ថ្ងៃ` : `${Math.round(hours / 24)}d`;
}

export function LiveIsland({
  notification,
  onRead,
}: {
  notification: InboxNotification;
  onRead: (id: string) => void;
}) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const tone = toneForLevel(notification.level);
  const urgent = tone === 'urgent';
  const transition = reduceMotion ? { duration: 0 } : SPRING;

  return (
    <m.div
      layout
      transition={transition}
      className={cn(
        'island',
        urgent && 'island-urgent',
        // The sweep runs only on a genuinely live item. Reduced motion is
        // handled in CSS, NOT by dropping the class here — a class that depends
        // on useReducedMotion() differs between server and client and hands
        // reduced-motion visitors a hydration mismatch. See the note in
        // SwipeableRow, and the longer one in app/template.tsx.
        urgent && 'island-sheen'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* The live dot. Present only when something is actually live, so it
            never becomes decoration people stop seeing. */}
        <m.span
          layout="position"
          transition={transition}
          className={cn(
            'shrink-0',
            urgent ? 'capsule-live-dot text-gold-bright' : 'h-1.5 w-1.5 rounded-full bg-white/40'
          )}
          aria-hidden="true"
        />

        <m.span layout="position" transition={transition} className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-white">
            {notification.title}
          </span>
          {!open && notification.body && (
            <span className="mt-0.5 block truncate text-xs text-white/55">{notification.body}</span>
          )}
        </m.span>

        <m.span
          layout="position"
          transition={transition}
          className="shrink-0 font-mono text-[11px] text-white/45"
        >
          {relativeTime(notification.created_at, lang)}
        </m.span>

        <m.span layout="position" transition={transition} aria-hidden="true">
          <ChevronDown
            size={15}
            className={cn(
              'shrink-0 text-white/45 transition-transform duration-300 ease-smooth',
              open && 'rotate-180'
            )}
          />
        </m.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="island-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-4 pb-4 pt-3">
              {notification.body && (
                <p className="text-sm leading-relaxed text-white/75">{notification.body}</p>
              )}

              <div className="mt-3.5 flex flex-wrap gap-2">
                <Link
                  href={notification.deep_link}
                  onClick={() => notification.read_at === null && onRead(notification.id)}
                  className={cn(
                    'liquid-press inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn px-4 text-sm font-semibold transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2',
                    urgent
                      ? 'liquid-glass-accent text-primary-deep hover:brightness-105 focus-visible:ring-gold-bright'
                      : 'border border-white/15 text-white hover:border-gold-light/40 focus-visible:ring-gold-light'
                  )}
                >
                  {lang === 'km' ? 'បើក' : 'Open'}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>

                {notification.read_at === null && (
                  <button
                    type="button"
                    onClick={() => onRead(notification.id)}
                    className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-white/12 px-3.5 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                  >
                    <Check size={14} aria-hidden="true" />
                    {lang === 'km' ? 'បានឃើញ' : 'Got it'}
                  </button>
                )}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}
