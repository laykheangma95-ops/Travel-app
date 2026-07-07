'use client';

import { useEffect, useState } from 'react';
import { Gauge, MoveVertical, Compass, Radio, Radar, Camera } from 'lucide-react';
import type { LiveFlightResult } from '@/lib/liveFlight';
import { headingToCompass } from '@/lib/liveFlight';

const POLL_MS = 20_000; // ADS-B positions refresh every few seconds; 20s is plenty

// Live aircraft telemetry panel — powered by the open ADS-B receiver network
// (the same crowdsourced data FlightRadar24 is built on).
export function FlightLiveTracker({ flightNumber }: { flightNumber: string }) {
  const [data, setData] = useState<LiveFlightResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/flights/live?number=${encodeURIComponent(flightNumber)}`);
        if (!res.ok) return;
        const json = (await res.json()) as LiveFlightResult;
        if (!cancelled) setData(json);
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
  }, [flightNumber]);

  if (!data) return null;

  if (!data.live) {
    return (
      <div className="mt-6 flex items-center gap-4 rounded-card border border-line/60 bg-white p-6 shadow-card">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-3">
          <Radar size={20} className="text-ink-muted" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Live aircraft tracking on standby</p>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {data.reason === 'not-airborne'
              ? 'The aircraft is not broadcasting right now — live position, altitude, and speed appear here automatically once it takes off.'
              : 'The live tracking network is unreachable from this connection. It activates automatically when available.'}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Data: open ADS-B receiver network — the same source FlightRadar24 uses.
          </p>
        </div>
      </div>
    );
  }

  const bbox = [data.lon - 1.2, data.lat - 0.7, data.lon + 1.2, data.lat + 0.7].join('%2C');
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${data.lat}%2C${data.lon}`;

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
    <article className="mt-6 overflow-hidden rounded-card border border-line/60 bg-white shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
          </span>
          <h2 className="font-display font-bold text-ink">
            LIVE — tracking {data.callsign}
            {data.onGround && <span className="ml-2 text-sm font-medium text-ink-muted">(on the ground)</span>}
          </h2>
        </div>
        <p className="hidden font-mono text-xs text-ink-muted sm:block">
          via {data.source} · updates every 20s
        </p>
      </div>

      {/* Live map */}
      <div className="relative h-72 w-full bg-surface-3 sm:h-80">
        <iframe
          key={`${data.lat.toFixed(3)}-${data.lon.toFixed(3)}`}
          title={`Live position of flight ${data.callsign}`}
          src={mapUrl}
          className="h-full w-full border-0"
          loading="lazy"
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-btn bg-primary/85 px-3 py-1.5 font-mono text-xs text-white backdrop-blur">
          {data.lat.toFixed(4)}, {data.lon.toFixed(4)}
        </div>
      </div>

      {/* Telemetry */}
      <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line sm:grid-cols-4 sm:divide-y-0">
        {stats.map((s) => (
          <div key={s.label} className="p-5 text-center">
            <s.icon size={18} className="mx-auto text-accent" aria-hidden="true" />
            <p className="mt-2 font-mono text-lg font-bold text-ink">{s.value}</p>
            <p className="text-xs text-ink-muted">
              {s.label}
              {s.sub && <span className="ml-1 text-ink-secondary">· {s.sub}</span>}
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
              className="h-28 w-44 rounded-card border border-line object-cover"
            />
            <figcaption className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted">
              <Camera size={10} aria-hidden="true" /> {data.photographer}
            </figcaption>
          </figure>
        )}
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Registration</dt>
            <dd className="font-mono font-semibold text-ink">{data.registration ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Aircraft type</dt>
            <dd className="font-mono font-semibold text-ink">{data.aircraftType ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Transponder</dt>
            <dd className="font-mono font-semibold text-ink">{data.hex.toUpperCase() || '—'}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
