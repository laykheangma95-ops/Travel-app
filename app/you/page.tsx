'use client';

// ─────────────────────────────────────────────────────────────────────────────
// YOU — everything that belongs to the traveler, in one place.
//
// This is the fifth tab, and its job is to keep the other four uncluttered
// (§20). It is a directory, not a dashboard: no metrics, no charts, no widgets.
//
// Note on what is NOT here: the brief lists Wallet and Travel documents. Neither
// exists in the product yet, and a tab full of links that go nowhere is worse
// than a shorter list — so they are left out rather than stubbed. Adding them is
// a matter of adding a row here once the screens exist.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Bell,
  ChevronRight,
  FileText,
  LifeBuoy,
  ListChecks,
  LogOut,
  Map,
  Settings,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/lib/i18n';
import { StatusBadge } from '@/components/travel/StatusBadge';

interface Row {
  href: string;
  icon: typeof Map;
  label: { en: string; km: string };
  hint?: { en: string; km: string };
  /** Only shown to a signed-in traveler. */
  private?: boolean;
}

const GROUPS: { title: { en: string; km: string }; rows: Row[] }[] = [
  {
    title: { en: 'Your travel', km: 'ដំណើររបស់អ្នក' },
    rows: [
      {
        href: '/trips',
        icon: Map,
        label: { en: 'Trips', km: 'ដំណើរ' },
        hint: { en: 'Plans, itineraries and memories', km: 'ផែនការ កម្មវិធី និងការចងចាំ' },
        private: true,
      },
      {
        href: '/my-esims',
        icon: Smartphone,
        label: { en: 'My eSIMs', km: 'eSIM របស់ខ្ញុំ' },
        hint: { en: 'QR codes, data and orders', km: 'កូដ QR ទិន្នន័យ និងការបញ្ជាទិញ' },
        private: true,
      },
      {
        href: '/checklist',
        icon: ListChecks,
        label: { en: 'Travel checklist', km: 'បញ្ជីត្រួតពិនិត្យ' },
      },
    ],
  },
  {
    title: { en: 'Notifications', km: 'ការជូនដំណឹង' },
    rows: [
      {
        href: '/updates',
        icon: Sparkles,
        label: { en: 'Domner Updates', km: 'ព័ត៌មានថ្មី' },
        hint: { en: 'Everything we have told you', km: 'អ្វីៗដែលយើងបានប្រាប់អ្នក' },
        private: true,
      },
      {
        href: '/you/notifications',
        icon: Bell,
        label: { en: 'Notification settings', km: 'ការកំណត់ការជូនដំណឹង' },
        hint: { en: 'Choose exactly what reaches you', km: 'ជ្រើសរើសអ្វីដែលមកដល់អ្នក' },
        private: true,
      },
    ],
  },
  {
    title: { en: 'Support', km: 'ជំនួយ' },
    rows: [
      {
        href: '/emergency',
        icon: Siren,
        label: { en: 'Emergency', km: 'បន្ទាន់' },
        hint: { en: 'Works with no connection', km: 'ដំណើរការដោយគ្មានអ៊ីនធឺណិត' },
      },
      { href: '/affiliate', icon: LifeBuoy, label: { en: 'Get help', km: 'ទទួលជំនួយ' } },
      {
        href: '/settings',
        icon: Settings,
        label: { en: 'Settings', km: 'ការកំណត់' },
        private: true,
      },
      { href: '/terms', icon: FileText, label: { en: 'Terms & privacy', km: 'លក្ខខណ្ឌ និងឯកជនភាព' } },
    ],
  },
];

export default function YouPage() {
  const { lang } = useLang();
  const { user, isAdmin, loading, signOut } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/notifications/inbox', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { unread?: number } | null) => {
        if (!cancelled && typeof body?.unread === 'number') setUnread(body.unread);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? null;
  const initial = name?.trim().charAt(0).toUpperCase() ?? null;

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        {/* Identity. A guest is not scolded for being one — they are simply
            shown what signing in would keep. */}
        <header className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold-light/30 bg-accent/15 font-display text-xl text-gold-bright"
            aria-hidden="true"
          >
            {initial ?? <UserRound size={22} />}
          </span>
          <div className="min-w-0">
            {loading ? (
              <span className="block h-6 w-40 animate-pulse rounded bg-white/10" aria-hidden="true" />
            ) : user ? (
              <>
                <h1 className="truncate font-display text-2xl text-white">{name}</h1>
                <p className="mt-0.5 text-sm text-white/60">
                  {lang === 'km' ? 'គណនី Domner' : 'Domner account'}
                </p>
              </>
            ) : (
              <>
                <h1 className="font-display text-2xl text-white">
                  {lang === 'km' ? 'អ្នកទស្សនា' : 'Guest'}
                </h1>
                <p className="mt-0.5 text-sm text-white/60">
                  {lang === 'km' ? 'ចូលគណនីដើម្បីរក្សាទុកដំណើរ' : 'Sign in to save trips and alerts'}
                </p>
              </>
            )}
          </div>
          {isAdmin && (
            <StatusBadge tone="info" className="ml-auto">
              {lang === 'km' ? 'បុគ្គលិក' : 'Staff'}
            </StatusBadge>
          )}
        </header>

        {!user && !loading && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/sign-in?returnTo=/you"
              className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
            >
              {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:border-gold-light/40"
            >
              {lang === 'km' ? 'បង្កើតគណនី' : 'Create account'}
            </Link>
          </div>
        )}

        {GROUPS.map((group) => {
          const rows = group.rows.filter((row) => !row.private || Boolean(user));
          if (rows.length === 0) return null;
          return (
            <section key={group.title.en} className="mt-8" aria-labelledby={`group-${group.title.en}`}>
              <h2
                id={`group-${group.title.en}`}
                className="text-[11px] font-semibold uppercase tracking-widest text-gold-light"
              >
                {group.title[lang]}
              </h2>
              <ul className="mt-2.5 overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
                {rows.map((row) => (
                  <li key={row.href} className="border-b border-white/8 last:border-b-0">
                    <Link
                      href={row.href}
                      className="flex min-h-[3.5rem] items-center gap-3 px-4 py-3 transition-colors duration-200 ease-smooth hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-light"
                    >
                      <row.icon size={18} className="shrink-0 text-white/55" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-white">{row.label[lang]}</span>
                        {row.hint && (
                          <span className="block truncate text-xs text-white/50">{row.hint[lang]}</span>
                        )}
                      </span>
                      {row.href === '/updates' && unread > 0 && (
                        <StatusBadge tone="urgent">{unread > 9 ? '9+' : unread}</StatusBadge>
                      )}
                      <ChevronRight size={16} className="shrink-0 text-white/35" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {isAdmin && (
          <Link
            href="/admin"
            className="mt-6 flex min-h-[3.5rem] items-center gap-3 rounded-card border border-[#57C8FF]/25 bg-[#57C8FF]/8 px-4 text-sm font-semibold text-[#8FD8FF] transition-colors hover:border-[#57C8FF]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <ShieldCheck size={18} aria-hidden="true" />
            {lang === 'km' ? 'ផ្ទាំងគ្រប់គ្រង' : 'Staff console'}
            <ChevronRight size={16} className="ml-auto" aria-hidden="true" />
          </Link>
        )}

        {user && (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-6 flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-btn border border-white/15 px-4 text-sm font-semibold text-white/75 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <LogOut size={16} aria-hidden="true" />
            {lang === 'km' ? 'ចាកចេញ' : 'Sign out'}
          </button>
        )}
      </div>
    </div>
  );
}
