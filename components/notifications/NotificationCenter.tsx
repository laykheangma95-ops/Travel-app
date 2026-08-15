'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Domner Updates — one place for everything the journey told the traveler.
//
// Grouped by day, then ordered by urgency *within* the day rather than strictly
// by clock time: a gate change from an hour ago outranks a weather note from ten
// minutes ago, because the traveler is scanning for what they have to act on.
// Newest-first within each priority tier keeps it predictable.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BellRing, CheckCheck, Inbox, Settings2 } from 'lucide-react';
import { NotificationCard, type InboxNotification } from './NotificationCard';
import { PermissionPrompt } from './PermissionPrompt';
import {
  CATEGORY_LABEL,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '@/lib/notifications/catalog';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SignInLink } from '@/components/ui/SignInLink';

type Filter = 'all' | NotificationCategory;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

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

export function NotificationCenter() {
  const { lang } = useLang();
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

  const groups = useMemo(() => {
    const byDay = new Map<string, InboxNotification[]>();
    for (const item of filtered) {
      const key = dayKey(item.created_at);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
    for (const bucket of byDay.values()) {
      // Urgency first, then newest. This is the whole point of a priority
      // engine: the inbox reads in the order the traveler needs to act.
      bucket.sort((a, b) => a.level - b.level || b.created_at.localeCompare(a.created_at));
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const unread = (items ?? []).filter((item) => item.read_at === null).length;
  // Only offer categories that actually have something in them — an empty tab is
  // a dead end dressed as a feature.
  const present = new Set((items ?? []).map((item) => item.category));

  return (
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
          <SignInLink
            returnTo="/updates"
            className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
          >
            {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
          </SignInLink>
        </div>
      ) : (
        <>
          <PermissionPrompt reason="general" className="mt-5" />

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

          {items === null ? (
            <div className="mt-6 space-y-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">{lang === 'km' ? 'កំពុងផ្ទុក' : 'Loading updates'}</span>
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-[76px] animate-pulse rounded-card border border-white/8 bg-white/[0.03]" />
              ))}
            </div>
          ) : groups.length === 0 ? (
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
            <div className="mt-6 space-y-7">
              {groups.map(([key, bucket]) => (
                <section key={key} aria-labelledby={`day-${key}`}>
                  <h2
                    id={`day-${key}`}
                    className="text-[11px] font-semibold uppercase tracking-widest text-white/45"
                  >
                    {dayLabel(key, lang)}
                  </h2>
                  <div className="mt-2.5 space-y-2.5">
                    {bucket.map((item, position) => (
                      <NotificationCard
                        key={item.id}
                        notification={item}
                        onRead={markRead}
                        index={position}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
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
