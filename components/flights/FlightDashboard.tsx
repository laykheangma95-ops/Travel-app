'use client';

import { Bell, Plane, PlusCircle, Share2 } from 'lucide-react';
import type { FlightStatus } from '@/types';
import { FlightStatusBadge } from './FlightStatusBadge';
import { formatTime } from '@/lib/utils';

interface FlightDashboardProps {
  flight: FlightStatus;
  onNotify?: () => void;
  onShare?: () => void;
  onSave?: () => void;
  compact?: boolean;
}

export function FlightDashboard({ flight, onNotify, onShare, onSave, compact = false }: FlightDashboardProps) {
  const dep = flight.departure;
  const arr = flight.arrival;
  const progress = flight.progress ?? 0;

  return (
    <article className="overflow-hidden rounded-card border border-line/60 bg-white shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-6 py-5 sm:px-8">
        <div>
          <p className="font-mono text-2xl font-bold tracking-wide text-ink">{flight.flightNumber}</p>
          <p className="text-sm text-ink-secondary">{flight.airline}</p>
        </div>
        <FlightStatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
      </div>

      {/* Route */}
      <div className="grid gap-6 px-6 py-7 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:px-8">
        {/* Departure */}
        <div>
          <p className="font-mono text-4xl font-bold text-ink">{dep.airport}</p>
          <p className="mt-1 font-medium text-ink-secondary">{dep.city}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-muted">Departs:</dt>
              <dd className="font-mono font-semibold text-ink">
                {formatTime(dep.actualTime ?? dep.scheduledTime)}
                {dep.actualTime && (
                  <span className="ml-2 text-xs text-ink-muted line-through">{formatTime(dep.scheduledTime)}</span>
                )}
              </dd>
            </div>
            {dep.terminal && (
              <div className="flex gap-2">
                <dt className="text-ink-muted">Terminal</dt>
                <dd className="font-semibold text-ink">{dep.terminal}</dd>
              </div>
            )}
            {dep.gate && (
              <div className="flex gap-2">
                <dt className="text-ink-muted">Gate:</dt>
                <dd className="font-mono font-semibold text-accent">{dep.gate} ⬅ (check this gate)</dd>
              </div>
            )}
            {dep.checkInCounter && (
              <div className="flex gap-2">
                <dt className="text-ink-muted">Check-in:</dt>
                <dd className="font-semibold text-ink">{dep.checkInCounter}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Plane graphic */}
        <div className="hidden flex-col items-center pt-3 sm:flex" aria-hidden="true">
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="h-px w-14 bg-line" />
            <Plane size={22} className="text-secondary" />
            <span className="h-px w-14 bg-line" />
          </div>
        </div>

        {/* Arrival */}
        <div className="sm:text-right">
          <p className="font-mono text-4xl font-bold text-ink">{arr.airport}</p>
          <p className="mt-1 font-medium text-ink-secondary">{arr.city}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex gap-2 sm:justify-end">
              <dt className="text-ink-muted">Arrives:</dt>
              <dd className="font-mono font-semibold text-ink">
                {formatTime(arr.estimatedTime ?? arr.scheduledTime)}
              </dd>
            </div>
            {arr.terminal && (
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-ink-muted">Terminal</dt>
                <dd className="font-semibold text-ink">{arr.terminal}</dd>
              </div>
            )}
            {arr.gate && (
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-ink-muted">Gate:</dt>
                <dd className="font-mono font-semibold text-ink">{arr.gate}</dd>
              </div>
            )}
            {arr.baggageBelt && flight.status === 'landed' && (
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-ink-muted">Baggage belt:</dt>
                <dd className="font-mono font-semibold text-ink">{arr.baggageBelt}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Progress */}
      <div className="border-t border-line px-6 py-5 sm:px-8">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Flight progress"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-secondary to-accent transition-all duration-700 ease-smooth"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="font-medium">{progress}% complete</span>
          {flight.aircraft && (
            <span className="font-mono">
              Aircraft: {flight.aircraft}
              {flight.registration && ` · Registration: ${flight.registration}`}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!compact && (
        <div className="flex flex-col gap-3 border-t border-line bg-surface-2 px-6 py-5 sm:flex-row sm:px-8">
          <button
            type="button"
            onClick={onNotify}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:bg-orange-600 active:scale-[0.98]"
          >
            <Bell size={16} /> Notify Me
          </button>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-btn border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-all duration-200 ease-smooth hover:border-secondary hover:text-secondary active:scale-[0.98]"
          >
            <Share2 size={16} /> Share Flight
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-btn border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-all duration-200 ease-smooth hover:border-secondary hover:text-secondary active:scale-[0.98]"
          >
            <PlusCircle size={16} /> Save to Trip
          </button>
        </div>
      )}
    </article>
  );
}
