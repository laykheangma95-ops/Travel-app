import Link from 'next/link';
import { Map, Calendar, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">My Trips</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">Plan, prepare, and remember every journey.</p>
        </div>
        <Link
          href="/checklist"
          className="rounded-btn bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
        >
          + New Trip
        </Link>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No trips yet"
          description="Start planning your next adventure with the Am I Ready? checklist."
          ctaLabel="Plan a trip"
          ctaHref="/checklist"
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {trips.map((trip) => (
            <Card key={trip.id} hover className="overflow-hidden">
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-secondary to-primary text-6xl">
                <span role="img" aria-label={`${trip.destination} flag`}>{trip.flag}</span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <h2 className="font-display font-bold text-ink">{trip.title}</h2>
                  <Badge tone={trip.status === 'upcoming' ? 'accent' : 'neutral'}>
                    {trip.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-ink-secondary">
                  <p className="flex items-center gap-2">
                    <Calendar size={14} aria-hidden="true" /> {trip.dates}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users size={14} aria-hidden="true" /> {trip.travelers}{' '}
                    {trip.travelers === 1 ? 'traveler' : 'travelers'}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <p className="text-xs text-ink-muted">
                    Checklist: {trip.checklistDone}/{trip.checklistTotal} done
                  </p>
                  <Link
                    href={`/trips/${trip.id}/memories`}
                    className="text-sm font-semibold text-secondary transition-colors hover:text-accent"
                  >
                    Memories →
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
