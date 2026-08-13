// Client-side so the copy follows the language toggle. Demo constants only —
// nothing here was reading from the server.
'use client';

import Link from 'next/link';
import { Map, Calendar, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useLang } from '@/lib/i18n';

// Demo trips — served from trip_plans in Supabase once connected.
const trips = [
  {
    id: 'bangkok-weekend',
    title: 'Bangkok Weekend',
    destination: 'Thailand',
    flag: '🇹🇭',
    dates: '12–15 Jul 2026',
    travelers: 2,
    status: 'upcoming' as const,
    checklistDone: 8,
    checklistTotal: 15,
  },
  {
    id: 'japan-spring',
    title: 'Japan Cherry Blossom',
    destination: 'Japan',
    flag: '🇯🇵',
    dates: '2–9 Apr 2026',
    travelers: 1,
    status: 'past' as const,
    checklistDone: 15,
    checklistTotal: 15,
  },
];

export default function MyTripsPage() {
  const { t } = useLang();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{t('trips.title')}</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">{t('trips.sub')}</p>
        </div>
        <Link
          href="/checklist"
          className="rounded-btn bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
        >
          {t('trips.new')}
        </Link>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          icon={Map}
          title={t('trips.empty.title')}
          description={t('trips.empty.desc')}
          ctaLabel={t('trips.empty.cta')}
          ctaHref="/checklist"
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {trips.map((trip) => (
            <Card key={trip.id} hover className="overflow-hidden">
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-secondary to-primary">
                <WavyFlag flag={trip.flag} label={`${trip.destination} flag`} size={72} />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <h2 className="font-display font-bold text-ink">{trip.title}</h2>
                  <Badge tone={trip.status === 'upcoming' ? 'accent' : 'neutral'}>
                    {t(trip.status === 'upcoming' ? 'trips.upcoming' : 'trips.completed')}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-ink-secondary">
                  <p className="flex items-center gap-2">
                    <Calendar size={14} aria-hidden="true" /> {trip.dates}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users size={14} aria-hidden="true" />{' '}
                    {t(trip.travelers === 1 ? 'trips.traveler' : 'trips.travelers', {
                      count: trip.travelers,
                    })}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <p className="text-xs text-ink-muted">
                    {t('trips.checklist', {
                      done: trip.checklistDone,
                      total: trip.checklistTotal,
                    })}
                  </p>
                  <Link
                    href={`/trips/${trip.id}/memories`}
                    className="text-sm font-semibold text-secondary transition-colors hover:text-accent"
                  >
                    {t('trips.memories')}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
