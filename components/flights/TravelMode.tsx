'use client';

// Travel Mode: a full-screen, always-on flight card for the day of travel.
// The screen Wake Lock keeps the phone display awake, so travelers can prop
// their phone up and glance at gate/status without unlocking again and again
// — the closest a web app gets to Flighty's lock-screen Live Activity.

import { useEffect, useRef, useState } from 'react';
import { X, Plane, BellRing } from 'lucide-react';
import type { FlightStatus } from '@/types';
import { FlightStatusBadge } from './FlightStatusBadge';
import { DomerLogo } from '@/components/brand/DomerMark';
import { formatTime } from '@/lib/utils';

interface WakeLockSentinel {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
}

export function TravelMode({ flight, onClose }: { flight: FlightStatus; onClose: () => void }) {
  const [now, setNow] = useState(new Date());
  const [screenAwake, setScreenAwake] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  // Live clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep the screen awake; reacquire when the tab becomes visible again.
  useEffect(() => {
    const nav = navigator as unknown as NavigatorWithWakeLock;
    const acquire = async () => {
      try {
        lockRef.current = (await nav.wakeLock?.request('screen')) ?? null;
        setScreenAwake(Boolean(lockRef.current));
      } catch {
        setScreenAwake(false);
      }
    };
    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void lockRef.current?.release();
    };
  }, []);

  // Ask for notification permission so gate/status changes reach the tray too.
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const dep = flight.departure;
  const progress = flight.progress ?? 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[linear-gradient(180deg,#080D18_0%,#0C1424_48%,#0E1B30_100%)]"
      role="dialog"
      aria-modal="true"
      aria-label={`Travel mode for flight ${flight.flightNumber}`}
    >
      <div className="stars" aria-hidden="true" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-5 pt-5">
        <p className="flex items-center font-display text-sm font-extrabold text-white/80">
          <DomerLogo surface="navy" size={22} kicker={false} />
          <span className="ml-2 font-body text-xs font-medium uppercase tracking-widest text-white/40">
            Travel Mode
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit travel mode"
          className="rounded-full bg-white/10 p-2.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Clock */}
      <div className="relative mt-6 text-center">
        <p className="font-mono text-6xl font-bold tracking-tight text-white sm:text-7xl">
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          <span className="text-2xl text-white/40 sm:text-3xl">
            :{String(now.getSeconds()).padStart(2, '0')}
          </span>
        </p>
        <p className="mt-1 text-sm text-white/50">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Flight card */}
      <div className="relative mx-auto mt-8 w-full max-w-md flex-1 px-5 pb-10">
        <div className="rounded-card border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xl font-bold text-white">{flight.flightNumber}</p>
            <FlightStatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
          </div>
          <p className="mt-0.5 text-xs text-white/50">{flight.airline}</p>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-4xl font-bold text-white">{dep.airport}</p>
              <p className="text-xs text-white/50">{dep.city}</p>
            </div>
            <Plane size={20} className="rotate-45 text-accent" aria-hidden="true" />
            <div className="text-right">
              <p className="font-mono text-4xl font-bold text-white">{flight.arrival.airport}</p>
              <p className="text-xs text-white/50">{flight.arrival.city}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-gradient-to-r from-secondary to-accent transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* The two numbers that matter at the airport — HUGE */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-card bg-white/[0.06] p-4 text-center">
              <p className="text-[11px] uppercase tracking-widest text-white/40">Departs</p>
              <p className="mt-1 font-mono text-3xl font-bold text-white">
                {formatTime(dep.actualTime ?? dep.scheduledTime)}
              </p>
              {dep.actualTime && (
                <p className="text-xs text-white/35 line-through">{formatTime(dep.scheduledTime)}</p>
              )}
            </div>
            <div className="rounded-card bg-accent/15 p-4 text-center">
              <p className="text-[11px] uppercase tracking-widest text-gold-light/70">Gate</p>
              <p className="mt-1 font-mono text-3xl font-bold text-accent">{dep.gate ?? '—'}</p>
              {dep.terminal && <p className="text-xs text-white/40">Terminal {dep.terminal}</p>}
            </div>
          </div>

          {dep.checkInCounter && (
            <p className="mt-4 text-center text-sm text-white/60">
              Check-in: <span className="font-mono font-semibold text-white">{dep.checkInCounter}</span>
            </p>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-white/40">
          <BellRing size={13} aria-hidden="true" />
          {screenAwake
            ? 'Screen stays awake · status updates live every 90s'
            : 'Updates live every 90s — keep this screen open'}
        </p>
      </div>
    </div>
  );
}
