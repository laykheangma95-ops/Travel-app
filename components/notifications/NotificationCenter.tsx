'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Domner Updates — one place for everything the journey told the traveler.
//
// THE INFORMATION ARCHITECTURE, top to bottom:
//
//   1. THE ISLAND. Exactly one live thing, in exactly one place, always. A
//      traveler learns that spot once and never looks anywhere else for "what
//      is happening right now".
//   2. THE DAY GROUPS, each with a priority spine down the left edge — brightest
//      where the urgent items are, so the eye lands before it reads a word.
//   3. WITHIN A DAY, urgency before time. A gate change from an hour ago
//      outranks a weather note from ten minutes ago, because the traveler is
//      scanning for what they have to act on. This is the whole point of having
//      a priority engine: the inbox reads in the order you need to act.
//   4. WITHIN A SUBJECT, a stack. Five updates about one delayed flight are one
//      object with a count, not five cards burying the rest of the trip.
//
// Every action is optimistic and reversible-by-refresh, and every gesture has a
// button behind it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, LazyMotion, m, useReducedMotion } from 'framer-motion';
import { BellRing, CheckCheck, Inbox, Settings2 } from 'lucide-react';
import { type InboxNotification } from './NotificationCard';
import { NotificationStack } from './NotificationStack';
import { LiveIsland } from './LiveIsland';
import { PermissionPrompt } from './PermissionPrompt';
import {
  CATEGORY_LABEL,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '@/lib/notifications/catalog';
import { groupByDay, selectLive } from '@/lib/notifications/inbox';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Filter = 'all' | NotificationCategory;

/**
 * framer-motion's feature set, loaded AFTER first paint.
 *
 * `app/template.tsx` deliberately went pure-CSS to keep framer-motion off the
 * critical path for the whole site, and this screen must not quietly undo that.
 * LazyMotion + `m` ships only the ~5 kB core in the route bundle; `domMax` —
 * which is what drag and layout animations need — arrives in a second chunk once
 * the inbox is already on screen and readable.
 *
 * The cost of getting this wrong is paid by exactly the people we built for:
 * someone opening Domner on a Cambodian mobile connection to find out why their
 * flight moved.
 */
const loadMotionFeatures = () => import('framer-motion').then((mod) => mod.domMax);

function dayLabel(key: string, lang: 'en' | 'km'): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (key === today) return lang === 'km' ? 'ថ្ងៃនេះ' : 'Today';
  if (key === yesterday) return lang === 'km' ? 'ម្សិលមិញ' : 'Yesterday';
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** How bright the spine is for a day: driven by the most urgent thing in it. */
const SPINE_TOP: Record<number, string> = {
  1: 'rgba(230, 203, 139, 0.95)',
  2: 'rgba(252, 211, 77, 0.7)',
  3: 'rgba(143, 216, 255, 0.5)',
  4: 'rgba(255, 255, 255, 0.18)',
};

export function NotificationCenter() {
  const { lang } = useLang();
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<InboxNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notifications/inbox', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) setNeedsSignIn(true);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((body: { notifications?: InboxNotification[] } | null) => {
        if (!cancelled) setItems(body?.notifications ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic: the traveler has read it, whatever the server says next.
  const markRead = useCallback((id: string) => {
    setItems((current) =>
      current?.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item
      ) ?? current
    );
    void fetch('/api/notifications/inbox', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }, []);

  const clear = useCallback((id: string) => {
    // Removed from the list immediately; AnimatePresence carries the exit. A
    // failed request leaves the row gone until the next load, which is the
    // gentler failure — a card that reappears after you dismissed it reads as
    // the app arguing with you.
    setItems((current) => current?.filter((item) => item.id !== id) ?? current);
    void fetch('/api/notifications/inbox', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setItems((current) => current?.map((item) => ({ ...item, read_at: item.read_at ?? now })) ?? current);
    void fetch('/api/notifications/inbox', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
  }, []);

  const filtered = useMemo(
    () => (items ?? []).filter((item) => filter === 'all' || item.category === filter),
    [items, filter]
  );

  // The one live thing. See selectLive() for why "today" is part of the rule.
  const live = useMemo(
    () => selectLive(items ?? [], new Date().toISOString().slice(0, 10)),
    [items]
  );

  // Day → subject → items. The island's item is excluded from the list below so
  // one notification is never two objects on screen.
  const groups = useMemo(() => groupByDay(filtered, live?.id ?? null), [filtered, live]);

  const unread = (items ?? []).filter((item) => item.read_at === null).length;
  // Only offer categories that actually have something in them — an empty tab is
  // a dead end dressed as a feature.
  const present = new Set((items ?? []).map((item) => item.category));

  return (
    // `strict` makes the `motion.*` shorthand a build error inside this tree,
    // so nobody can accidentally pull the full bundle back in later.
    <LazyMotion features={loadMotionFeatures} strict>
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {lang === 'km' ? 'ព័ត៌មានថ្មី' : 'Domner Updates'}
          </p>
          <h1 className="mt-1.5 font-display text-3xl text-white sm:text-4xl">
            {unread > 0
              ? lang === 'km'
                ? `${unread} រឿងថ្មី`
                : `${unread} new`
              : lang === 'km'
                ? 'អ្នកទាន់សម័យ'
                : "You're up to date"}
          </h1>
        </div>

        <Link
          href="/you/notifications"
          className="flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors hover:border-gold-light/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          aria-label={lang === 'km' ? 'ការកំណត់ការជូនដំណឹង' : 'Notification settings'}
        >
          <Settings2 size={17} aria-hidden="true" />
        </Link>
      </header>

      {needsSignIn ? (
        <div className="night-card mt-6 p-6 text-center">
          <BellRing size={22} className="mx-auto text-gold-light" aria-hidden="true" />
          <h2 className="mt-3 font-display text-xl text-white">
            {lang === 'km' ? 'ចូលគណនីដើម្បីមើលព័ត៌មាន' : 'Sign in to see your updates'}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {lang === 'km'
              ? 'ព័ត៌មានជើងហោះហើរ eSIM និងដំណើររបស់អ្នកត្រូវការគណនី ដើម្បីរក្សាទុក។'
              : 'Flight, eSIM and trip updates are tied to your account so they follow you between devices.'}
          </p>
          <Link
            href="/sign-in?returnTo=/updates"
            className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
          >
            {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
          </Link>
        </div>
      ) : (
        <>
          {/* The island. One live thing, one place. */}
          <AnimatePresence initial={false} mode="popLayout">
            {live && (
              <m.div
                key={live.id}
                layout
                initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                transition={
                  reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                }
                className="mt-5"
              >
                <LiveIsland notification={live} onRead={markRead} />
              </m.div>
            )}
          </AnimatePresence>

          <PermissionPrompt reason="general" className="mt-4" />

          {/* Category filter. Horizontally scrollable, never wrapping into a
              second row that pushes the content down on a small phone. */}
          {present.size > 1 && (
            <div className="-mx-4 mt-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <div className="flex gap-2">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  {lang === 'km' ? 'ទាំងអស់' : 'All'}
                </FilterChip>
                {NOTIFICATION_CATEGORIES.filter((category) => present.has(category)).map((category) => (
                  <FilterChip
                    key={category}
                    active={filter === category}
                    onClick={() => setFilter(category)}
                  >
                    {CATEGORY_LABEL[category][lang]}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="mt-4 inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-medium text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              <CheckCheck size={15} aria-hidden="true" />
              {lang === 'km' ? 'សម្គាល់ថាបានអានទាំងអស់' : 'Mark all as read'}
            </button>
          )}

          {/* A hint about the gesture, once, where the gesture is. Pointer-only:
              a keyboard user has buttons and does not need to be told about
              swiping. */}
          {(items?.length ?? 0) > 0 && (
            <p className="mt-3 hidden text-xs text-white/35 [@media(hover:none)]:block">
              {lang === 'km'
                ? 'អូសទៅស្តាំដើម្បីសម្គាល់ថាបានអាន ទៅឆ្វេងដើម្បីលុប។'
                : 'Swipe right to mark read, left to clear.'}
            </p>
          )}

          {items === null ? (
            <div className="mt-6 space-y-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">{lang === 'km' ? 'កំពុងផ្ទុក' : 'Loading updates'}</span>
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-[76px] animate-pulse rounded-card border border-white/8 bg-white/[0.03]" />
              ))}
            </div>
          ) : groups.length === 0 && !live ? (
            <div className="night-card mt-6 p-8 text-center">
              <Inbox size={22} className="mx-auto text-white/45" aria-hidden="true" />
              <h2 className="mt-3 font-display text-xl text-white">
                {lang === 'km' ? 'គ្មានព័ត៌មានថ្មីទេ' : 'Nothing here yet'}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
                {lang === 'km'
                  ? 'ពេលអ្នកតាមដានជើងហោះហើរ ឬបង្កើតដំណើរ ព័ត៌មានសំខាន់ៗនឹងបង្ហាញនៅទីនេះ។'
                  : 'Track a flight or start a trip, and everything worth knowing shows up here.'}
              </p>
            </div>
          ) : (
            <div className="mt-7 space-y-8">
              {groups.map(({ day, stacks, topLevel }) => (
                <section key={day} aria-labelledby={`day-${day}`} className="relative pl-4">
                  {/* The priority spine. Decorative — the urgency is in each
                      card's own icon, tone and wording. */}
                  <span
                    className="spine"
                    style={{ '--spine-top': SPINE_TOP[topLevel] } as React.CSSProperties}
                    aria-hidden="true"
                  />

                  <h2
                    id={`day-${day}`}
                    className="text-[11px] font-semibold uppercase tracking-widest text-white/45"
                  >
                    {dayLabel(day, lang)}
                  </h2>

                  <div className="mt-3 space-y-2.5">
                    <AnimatePresence initial={false}>
                      {stacks.map((stack, position) => (
                        <m.div
                          key={stack[0].id}
                          layout={!reduceMotion}
                          exit={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, x: -60, height: 0, marginTop: 0 }
                          }
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 440, damping: 36 }
                          }
                        >
                          <NotificationStack
                            items={stack}
                            onRead={markRead}
                            onClear={clear}
                            index={position}
                          />
                        </m.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
        )}
      </div>
    </LazyMotion>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-[2.25rem] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
        active
          ? 'border-gold-light/50 bg-accent/18 text-gold-bright'
          : 'border-white/12 bg-white/5 text-white/65 hover:border-white/25 hover:text-white'
      )}
    >
      {children}
    </button>
  );
}
