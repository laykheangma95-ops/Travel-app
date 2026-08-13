'use client';

// ─────────────────────────────────────────────────────────────────────────────
// YOU → Notifications.
//
// Every category is individually controllable (§11). Two design decisions worth
// spelling out:
//
//   1. SAVES ON CHANGE, no Save button. A preferences screen with a Save button
//      is a screen people leave without saving. Each switch writes immediately
//      and rolls back visibly if the write fails.
//   2. THE DEVICE STATE IS AT THE TOP. Switching a category on does nothing if
//      push is off on this device, so the permission state is the first thing
//      on the page rather than a footnote under it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MoonStar } from 'lucide-react';
import { PermissionPrompt } from '@/components/notifications/PermissionPrompt';
import {
  PREFERENCE_GROUPS,
  defaultPreferences,
  type NotificationPreferences,
} from '@/lib/notifications/preferences';
import type { PreferenceKey } from '@/lib/notifications/catalog';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function NotificationPreferencesPage() {
  const { lang } = useLang();
  const { user, loading: sessionLoading } = useSession();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/notifications/preferences', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { preferences?: NotificationPreferences } | null) => {
        if (!cancelled) setPrefs(body?.preferences ?? defaultPreferences);
      })
      .catch(() => {
        if (!cancelled) setPrefs(defaultPreferences);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const write = useCallback(
    async (patch: Partial<NotificationPreferences>, key: string) => {
      const previous = prefs;
      // Optimistic: a switch that waits for the network feels broken.
      setPrefs((current) => (current ? { ...current, ...patch } : current));
      setPending((current) => new Set(current).add(key));
      setError(null);

      try {
        const res = await fetch('/api/notifications/preferences', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('save failed');
        const body = (await res.json()) as { preferences?: NotificationPreferences };
        if (body.preferences) setPrefs(body.preferences);
      } catch {
        // Roll the switch back so the screen never claims a setting it did not
        // manage to store.
        setPrefs(previous);
        setError(
          lang === 'km'
            ? 'មិនអាចរក្សាទុកបានទេ។ សូមព្យាយាមម្តងទៀត។'
            : 'Could not save that. Please try again.'
        );
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [prefs, lang]
  );

  if (!sessionLoading && !user) {
    return (
      <div className="night-canvas has-tabbar relative min-h-screen">
        <div className="night-stars" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
          <h1 className="font-display text-2xl text-white">
            {lang === 'km' ? 'ចូលគណនីដើម្បីកំណត់' : 'Sign in to set your alerts'}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {lang === 'km'
              ? 'ការកំណត់ការជូនដំណឹងត្រូវការគណនី ដើម្បីអនុវត្តលើគ្រប់ឧបករណ៍។'
              : 'Notification settings are tied to your account so they apply on every device.'}
          </p>
          <Link
            href="/sign-in?returnTo=/you/notifications"
            className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
          >
            {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href="/you"
          className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {lang === 'km' ? 'អ្នក' : 'You'}
        </Link>

        <h1 className="mt-4 font-display text-3xl text-white sm:text-4xl">
          {lang === 'km' ? 'ការជូនដំណឹង' : 'Notifications'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          {lang === 'km'
            ? 'អ្នកសម្រេចថាអ្វីមកដល់អ្នក។ ការជូនដំណឹងទាំងអស់នៅតែបង្ហាញក្នុង Domner Updates។'
            : 'You decide what reaches you. Everything still appears in Domner Updates either way.'}
        </p>

        <PermissionPrompt embedded reason="general" className="mt-6" />

        {error && (
          <p className="mt-4 rounded-btn border border-warning/40 bg-warning/10 p-3 text-sm text-[#FCD34D]" role="alert">
            {error}
          </p>
        )}

        {prefs === null ? (
          <div className="mt-6 space-y-4" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-32 animate-pulse rounded-card border border-white/8 bg-white/[0.03]" />
            ))}
          </div>
        ) : (
          <>
            {/* Master switch. Sits above the categories because it overrides
                every one of them. */}
            <div className="night-card mt-4 p-5">
              <SwitchRow
                id="push_enabled"
                label={lang === 'km' ? 'ការជូនដំណឹងរុញ' : 'Push notifications'}
                detail={
                  lang === 'km'
                    ? 'បិទវាដើម្បីស្ងាត់ទាំងអស់ ដោយមិនបាត់ការជ្រើសរើសខាងក្រោម។'
                    : 'Off silences everything without losing your choices below.'
                }
                checked={prefs.push_enabled}
                busy={pending.has('push_enabled')}
                onChange={(next) => void write({ push_enabled: next }, 'push_enabled')}
              />
            </div>

            <div className={cn('mt-4 space-y-4', !prefs.push_enabled && 'opacity-60')}>
              {PREFERENCE_GROUPS.map((group) => (
                <section
                  key={group.category}
                  className="night-card p-5"
                  aria-labelledby={`prefs-${group.category}`}
                >
                  <h2
                    id={`prefs-${group.category}`}
                    className="font-display text-lg text-white"
                  >
                    {group.title[lang]}
                  </h2>
                  <p className="mt-0.5 text-sm text-white/55">{group.blurb[lang]}</p>

                  <div className="mt-4 divide-y divide-white/8">
                    {group.items.map((item) => (
                      <div key={item.key} className="py-3 first:pt-0 last:pb-0">
                        <SwitchRow
                          id={item.key}
                          label={item.label[lang]}
                          detail={item.detail[lang]}
                          checked={prefs[item.key]}
                          busy={pending.has(item.key)}
                          onChange={(next) =>
                            void write({ [item.key]: next } as Partial<NotificationPreferences>, item.key)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Quiet hours. Deliberately a plain pair of selects: a time-range
                slider is charming and unusable on a phone at 1am. */}
            <section className="night-card mt-4 p-5" aria-labelledby="prefs-quiet">
              <h2 id="prefs-quiet" className="flex items-center gap-2 font-display text-lg text-white">
                <MoonStar size={17} className="text-gold-light" aria-hidden="true" />
                {lang === 'km' ? 'ម៉ោងស្ងាត់' : 'Quiet hours'}
              </h2>
              <p className="mt-0.5 text-sm text-white/55">
                {lang === 'km'
                  ? 'ការជូនដំណឹងសំខាន់តិចនឹងរង់ចាំ។ ការផ្លាស់ប្តូរទ្វារ និងការឡើងយន្តហោះនៅតែមកដល់។'
                  : 'Lower-priority updates wait. Gate changes and boarding calls always come through.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-4">
                <HourSelect
                  id="quiet-start"
                  label={lang === 'km' ? 'ចាប់ពី' : 'From'}
                  value={prefs.quiet_hours_start}
                  onChange={(value) =>
                    void write(
                      {
                        quiet_hours_start: value,
                        // Storing one half of a range is meaningless, so a start
                        // implies a default end the traveler can then adjust.
                        quiet_hours_end: value === null ? null : (prefs.quiet_hours_end ?? 7),
                        timezone:
                          prefs.timezone ??
                          Intl.DateTimeFormat().resolvedOptions().timeZone ??
                          null,
                      },
                      'quiet-start'
                    )
                  }
                />
                <HourSelect
                  id="quiet-end"
                  label={lang === 'km' ? 'ដល់' : 'Until'}
                  value={prefs.quiet_hours_end}
                  disabled={prefs.quiet_hours_start === null}
                  onChange={(value) => void write({ quiet_hours_end: value }, 'quiet-end')}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  detail,
  checked,
  busy,
  onChange,
}: {
  id: PreferenceKey | 'push_enabled';
  label: string;
  detail: string;
  checked: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  // A real checkbox, visually restyled: it keeps keyboard operation, the
  // checked state for screen readers, and form semantics for free.
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-white">{label}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-white/55">{detail}</span>
      </span>

      <span className="relative mt-0.5 shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'block h-7 w-12 rounded-full border transition-colors duration-200 ease-smooth',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-gold-light peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-primary-deep',
            checked ? 'border-gold-light/60 bg-accent/70' : 'border-white/20 bg-white/10',
            busy && 'opacity-60'
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-0.5 top-0.5 block h-6 w-6 rounded-full bg-white shadow transition-transform duration-300',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </span>
    </label>
  );
}

function HourSelect({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <span className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-widest text-white/50">
        {label}
      </label>
      <select
        id={id}
        value={value === null ? '' : String(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        className="min-h-[2.75rem] rounded-btn border border-white/15 bg-primary-deep/80 px-3 font-mono text-sm text-white focus:border-gold-light/60 focus:outline-none focus:ring-2 focus:ring-gold-light/40 disabled:opacity-50"
      >
        <option value="">—</option>
        {Array.from({ length: 24 }, (_, hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, '0')}:00
          </option>
        ))}
      </select>
    </span>
  );
}
