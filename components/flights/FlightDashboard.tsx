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

// Boarding-pass style flight card in a dark premium finish: ticket header
// with the route and a dashed flight path, a perforated seam, and telemetry
// details below — Singapore Airlines meets Flighty.
export function FlightDashboard({ flight, onNotify, onShare, onSave, compact = false }: FlightDashboardProps) {
  const dep = flight.departure;
  const arr = flight.arrival;
  const progress = flight.progress ?? 0;

  return (
    <article className="overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(170deg,#23406A_0%,#14263F_55%,#0E1B30_100%)] shadow-card-hover">
      {/* Ticket header */}
      <div className="relative px-6 py-6 text-white sm:px-8">
        <div className="stars-far" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-2xl font-bold tracking-wide">{flight.flightNumber}</p>
              <p className="text-sm text-white/50">{flight.airline}</p>
            </div>
            <FlightStatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
          </div>

          {/* Route with dashed flight path */}
          <div className="mt-6 flex items-center gap-4">
            <div className="shrink-0">
              <p className="font-mono text-4xl font-bold sm:text-5xl">{dep.airport}</p>
              <p className="mt-1 text-sm text-white/50">{dep.city}</p>
              <p className="mt-1.5 font-mono text-sm font-semibold">
                {formatTime(dep.actualTime ?? dep.scheduledTime)}
                {dep.actualTime && (
                  <span className="ml-2 text-xs text-white/30 line-through">{formatTime(dep.scheduledTime)}</span>
                )}
              </p>
            </div>

            <div className="relative min-w-0 flex-1" aria-hidden="true">
              <div className="border-t-2 border-dashed border-white/20" />
              {/* Progress trail */}
              <div
                className="absolute -top-[2px] left-0 border-t-2 border-success transition-all duration-700 ease-smooth"
                style={{ width: `${progress}%` }}
              />
              <span
                className="absolute -top-[13px] -ml-3 transition-all duration-700 ease-smooth"
                style={{ left: `${Math.min(96, Math.max(2, progress))}%` }}
              >
                <Plane size={22} className="rotate-45 text-white drop-shadow-[0_2px_10px_rgba(198,151,73,0.7)]" />
              </span>
              {/* Percentage flown, riding along with the plane */}
              {progress > 0 && progress < 100 && (
                <span
                  className="absolute top-2.5 -ml-5 rounded-full border border-white/15 bg-[#0E1B30]/90 px-2 py-0.5 font-mono text-[10px] font-bold text-accent transition-all duration-700 ease-smooth"
                  style={{ left: `${Math.min(96, Math.max(2, progress))}%` }}
                >
                  {progress}%
                </span>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="font-mono text-4xl font-bold sm:text-5xl">{arr.airport}</p>
              <p className="mt-1 text-sm text-white/50">{arr.city}</p>
              <p className="mt-1.5 font-mono text-sm font-semibold">
                {formatTime(arr.estimatedTime ?? arr.scheduledTime)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Perforated seam */}
      <div className="ticket-notch ticket-notch-dark relative border-t-2 border-dashed border-white/15" aria-hidden="true" />

      {/* Details */}
      <div className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <dl className="space-y-1.5 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/35">Departure</p>
          {dep.terminal && (
            <div className="flex gap-2">
              <dt className="text-white/45">Terminal</dt>
              <dd className="font-semibold text-white">{dep.terminal}</dd>
            </div>
          )}
          {dep.gate && (
            <div className="flex gap-2">
              <dt className="text-white/45">Gate:</dt>
              <dd className="font-mono font-semibold text-accent">{dep.gate} ⬅ (check this gate)</dd>
            </div>
          )}
          {dep.checkInCounter && (
            <div className="flex gap-2">
              <dt className="text-white/45">Check-in:</dt>
              <dd className="font-semibold text-white">{dep.checkInCounter}</dd>
            </div>
          )}
        </dl>
        <dl className="space-y-1.5 text-sm sm:text-right">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/35">Arrival</p>
          {arr.terminal && (
            <div className="flex gap-2 sm:justify-end">
              <dt className="text-white/45">Terminal</dt>
              <dd className="font-semibold text-white">{arr.terminal}</dd>
            </div>
          )}
          {arr.gate && (
            <div className="flex gap-2 sm:justify-end">
              <dt className="text-white/45">Gate:</dt>
              <dd className="font-mono font-semibold text-white">{arr.gate}</dd>
            </div>
          )}
          {arr.baggageBelt && flight.status === 'landed' && (
            <div className="flex gap-2 sm:justify-end">
              <dt className="text-white/45">Baggage belt:</dt>
              <dd className="font-mono font-semibold text-white">{arr.baggageBelt}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Progress */}
      <div className="border-t border-white/10 px-6 py-5 sm:px-8">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-white/10"
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
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
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
        <div className="flex flex-col gap-3 border-t border-white/10 bg-white/[0.03] px-6 py-5 sm:flex-row sm:px-8">
          <button
            type="button"
            onClick={onNotify}
            className="liquid-glass-accent liquid-sheen inline-flex flex-1 items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-110 active:scale-[0.98]"
          >
            <Bell size={16} /> Notify Me
          </button>
          <button
            type="button"
            onClick={onShare}
            className="liquid-glass liquid-sheen inline-flex flex-1 items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 active:scale-[0.98]"
          >
            <Share2 size={16} /> Share Flight
          </button>
          <button
            type="button"
            onClick={onSave}
            className="liquid-glass liquid-sheen inline-flex flex-1 items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 active:scale-[0.98]"
          >
            <PlusCircle size={16} /> Save to Trip
          </button>
        </div>
      )}
    </article>
  );
}
