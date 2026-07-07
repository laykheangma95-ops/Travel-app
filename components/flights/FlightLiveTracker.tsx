'use client';

import { useEffect, useState } from 'react';
import { Gauge, MoveVertical, Compass, Radio, Radar, Camera } from 'lucide-react';
import type { LiveFlightResult } from '@/lib/liveFlight';
import { headingToCompass } from '@/lib/liveFlight';
import { LiveMap } from './LiveMap';

const POLL_MS = 20_000; // ADS-B positions refresh every few seconds; 20s is plenty

interface FlightLiveTrackerProps {
  flightNumber: string;
  depIata?: string;
  arrIata?: string;
  /** Called with each live fix (or null) so the parent can derive progress. */
  onLive?: (data: (LiveFlightResult & { live: true }) | null) => void;
}

// Live aircraft telemetry panel — powered by the open ADS-B receiver network
// (the same crowdsourced data FlightRadar24 is built on). Dark, premium,
// Singapore-Airlines-style presentation.
export function FlightLiveTracker({ flightNumber, depIata, arrIata, onLive }: FlightLiveTrackerProps) {
  const [data, setData] = useState<LiveFlightResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/flights/live?number=${encodeURIComponent(flightNumber)}`);
        if (!res.ok) return;
        const json = (await res.json()) as LiveFlightResult;
        if (!cancelled) {
          setData(json);
          onLive?.(json.live ? json : null);
        }
      } catch {
        // network hiccup — keep last known state
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNumber]);

  if (!data) {
    return (
      <div className="mt-6 flex items-center gap-4 rounded-card border border-white/10 bg-white/5 p-6 backdrop-blur">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
        </span>
        <p className="text-sm text-white/60">Connecting to the live tracking network…</p>
      </div>
    );
  }

  if (!data.live) {
    return (
      <div className="mt-6 flex items-center gap-4 rounded-card border border-white/10 bg-white/5 p-6 backdrop-blur">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Radar size={20} className="text-white/60" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Live aircraft tracking on standby</p>
          <p className="mt-0.5 text-sm text-white/60">
            {data.reason === 'not-airborne'
              ? 'The aircraft is not broadcasting right now — live position, altitude, and speed appear here automatically once it takes off.'
              : 'The live tracking network is unreachable from this connection. It activates automatically when available.'}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Data: open ADS-B receiver network — the same source FlightRadar24 uses.
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      icon: MoveVertical,
      label: 'Altitude',
      value: data.altitudeFt !== null ? `${data.altitudeFt.toLocaleString()} ft` : '—',
      sub: data.altitudeFt !== null ? `${Math.round(data.altitudeFt * 0.3048).toLocaleString()} m` : '',
    },
    {
      icon: Gauge,
      label: 'Ground speed',
      value: data.groundSpeedKt !== null ? `${Math.round(data.groundSpeedKt)} kt` : '—',
      sub: data.groundSpeedKt !== null ? `${Math.round(data.groundSpeedKt * 1.852)} km/h` : '',
    },
    {
      icon: Compass,
      label: 'Heading',
      value: data.headingDeg !== null ? `${Math.round(data.headingDeg)}°` : '—',
      sub: data.headingDeg !== null ? headingToCompass(data.headingDeg) : '',
    },
    {
      icon: Radio,
      label: 'Squawk',
      value: data.squawk ?? '—',
      sub:
        data.verticalRateFpm !== null
          ? `${data.verticalRateFpm > 0 ? '↑' : data.verticalRateFpm < 0 ? '↓' : ''} ${Math.abs(data.verticalRateFpm)} fpm`
          : '',
    },
  ];

  return (
    <article className="mt-6 overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(170deg,#0A1930_0%,#060B16_100%)] shadow-card-hover">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
          </span>
          <h2 className="font-display font-bold text-white">
            LIVE — tracking {data.callsign}
            {data.onGround && <span className="ml-2 text-sm font-medium text-white/50">(on the ground)</span>}
          </h2>
        </div>
        <p className="hidden font-mono text-xs text-white/40 sm:block">
          {data.ageSeconds > 30
            ? `last signal ${Math.round(data.ageSeconds / 60) || 1} min ago`
            : `via ${data.source} · updates every 20s`}
        </p>
      </div>

      {/* Live dark map with rotated plane, route, and trail */}
      <div className="relative">
        <LiveMap
          lat={data.lat}
          lon={data.lon}
          headingDeg={data.headingDeg}
          depIata={depIata}
          arrIata={arrIata}
          callsign={data.callsign}
        />
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-btn bg-[#060B16]/85 px-3 py-1.5 font-mono text-xs text-white/80 backdrop-blur">
          {data.lat.toFixed(4)}, {data.lon.toFixed(4)}
        </div>
      </div>

      {/* Telemetry instruments */}
      <div className="grid grid-cols-2 border-b border-t border-white/10 sm:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`p-5 text-center ${i > 0 ? 'border-l border-white/10' : ''} ${i >= 2 ? 'max-sm:border-t max-sm:border-white/10' : ''} ${i === 2 ? 'max-sm:border-l-0' : ''}`}
          >
            <s.icon size={18} className="mx-auto text-accent" aria-hidden="true" />
            <p className="mt-2 font-mono text-xl font-bold tracking-tight text-white">{s.value}</p>
            <p className="text-xs text-white/40">
              {s.label}
              {s.sub && <span className="ml-1 text-white/60">· {s.sub}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Aircraft identity */}
      <div className="flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:px-8">
        {data.photoUrl && (
          <figure className="shrink-0">
            {/* Photo URLs come from planespotters' CDN at runtime — next/image domains can't be pre-declared for it */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.photoUrl}
              alt={`Aircraft ${data.registration ?? data.callsign}`}
              className="h-28 w-44 rounded-card border border-white/15 object-cover"
            />
            <figcaption className="mt-1 flex items-center gap-1 text-[10px] text-white/40">
              <Camera size={10} aria-hidden="true" /> {data.photographer}
            </figcaption>
          </figure>
        )}
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/40">Registration</dt>
            <dd className="font-mono font-semibold text-white">{data.registration ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/40">Aircraft type</dt>
            <dd className="font-mono font-semibold text-white">{data.aircraftType ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/40">Transponder</dt>
            <dd className="font-mono font-semibold text-white">{data.hex.toUpperCase() || '—'}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
