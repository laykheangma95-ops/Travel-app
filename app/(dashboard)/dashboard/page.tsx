// Client-side because the copy has to follow the language toggle. The page
// renders demo constants only — nothing here was reading from the server.
'use client';

import Link from 'next/link';
import { Plane, Smartphone, Map, PlusCircle, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

// Demo dashboard data — replaced by Supabase queries once the project is
// connected (see saved_flights, esim_orders, trip_plans tables).
const upcomingFlights = [
  { number: 'QH215', route: 'PNH → BKK', date: 'Tomorrow · 14:30', status: 'On Time' as const },
];

const activeEsims = [
  { country: 'Thailand', flag: '🇹🇭', plan: 'Standard', daysLeft: 5, totalDays: 7, dataUsedPct: 42 },
];

const upcomingTrips = [{ title: 'Bangkok Weekend', dates: '12–15 Jul 2026', destination: 'Thailand 🇹🇭' }];

export default function DashboardPage() {
  const { t } = useLang();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{t('dash.welcome')}</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">{t('dash.sub')}</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/flights"
          className="flex flex-col items-center gap-2 rounded-card border border-line/60 bg-white p-5 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-card-hover"
        >
          <Plane size={22} className="text-accent" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink sm:text-sm">{t('dash.quick.flight')}</span>
        </Link>
        <Link
          href="/esim"
          className="flex flex-col items-center gap-2 rounded-card border border-line/60 bg-white p-5 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-card-hover"
        >
          <Smartphone size={22} className="text-accent" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink sm:text-sm">{t('dash.quick.esim')}</span>
        </Link>
        <Link
          href="/checklist"
          className="flex flex-col items-center gap-2 rounded-card border border-line/60 bg-white p-5 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-card-hover"
        >
          <PlusCircle size={22} className="text-accent" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink sm:text-sm">{t('dash.quick.trip')}</span>
        </Link>
      </div>

      {/* Upcoming flights */}
      <section aria-labelledby="flights-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="flights-heading" className="font-display text-lg font-bold text-ink">
            {t('dash.flights')}
          </h2>
          <Link href="/flights" className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-accent">
            {t('dash.trackNew')} <ArrowRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {upcomingFlights.map((f) => (
            <Card key={f.number} className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-card bg-blue-50">
                  <Plane size={20} className="text-secondary" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono font-bold text-ink">{f.number}</p>
                  <p className="text-sm text-ink-secondary">
                    {f.route} · {f.date}
                  </p>
                </div>
              </div>
              <Badge tone="success">{f.status}</Badge>
            </Card>
          ))}
        </div>
      </section>

      {/* Active eSIMs */}
      <section aria-labelledby="esims-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="esims-heading" className="font-display text-lg font-bold text-ink">
            {t('dash.esims')}
          </h2>
          <Link href="/my-esims" className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-accent">
            {t('dash.viewAll')} <ArrowRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {activeEsims.map((e) => (
            <Card key={e.country} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <WavyFlag flag={e.flag} label={`${e.country} flag`} size={44} />
                  <div>
                    <p className="font-semibold text-ink">
                      {e.country} — {e.plan}
                    </p>
                    <p className="text-sm text-ink-secondary">{t('dash.daysLeft', { days: e.daysLeft })}</p>
                  </div>
                </div>
                <Badge tone="success">{t('dash.active')}</Badge>
              </div>
              <ProgressBar
                value={e.dataUsedPct}
                tone="secondary"
                label={t('dash.dataUsed', { pct: e.dataUsedPct })}
                className="mt-4"
              />
            </Card>
          ))}
        </div>
      </section>

      {/* Upcoming trips */}
      <section aria-labelledby="trips-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="trips-heading" className="font-display text-lg font-bold text-ink">
            {t('dash.trips')}
          </h2>
          <Link href="/my-trips" className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-accent">
            {t('dash.viewAll')} <ArrowRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {/* Named `trip`, not `t` — the translator is called inside this block. */}
          {upcomingTrips.map((trip) => (
            <Card key={trip.title} className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-card bg-[#F5EEDC]">
                  <Map size={20} className="text-accent" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-ink">{trip.title}</p>
                  <p className="text-sm text-ink-secondary">
                    {trip.destination} · {trip.dates}
                  </p>
                </div>
              </div>
              <Link
                href="/my-trips"
                className="text-sm font-semibold text-secondary transition-colors hover:text-accent"
              >
                {t('dash.open')} →
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
