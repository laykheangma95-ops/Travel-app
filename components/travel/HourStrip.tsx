'use client';

// ─────────────────────────────────────────────────────────────────────────────
// HourStrip — the next few hours as a row of moments.
//
// A weather notification that says "rain expected this afternoon" makes you go
// and look. One that shows 4PM 5PM 6PM 7PM with the wet ones marked answers the
// actual question — *when do I need to be indoors?* — inside the notification.
//
// The peak cell (the hour the caller flags as the one that matters) is the only
// highlighted one. Highlighting several would be highlighting none.
// ─────────────────────────────────────────────────────────────────────────────

import { Cloud, CloudRain, CloudSun, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Hour {
  /** Display label, already localised by the caller: '4PM', '16:00'. */
  label: string;
  temperatureC: number;
  /** WMO weather interpretation code, as used by lib/live/weather.ts. */
  code: number;
}

/** WMO codes, collapsed to the four states worth drawing at this size. */
function iconFor(code: number) {
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 99)) return CloudRain;
  if (code >= 45 && code <= 48) return Cloud;
  if (code >= 2 && code <= 3) return CloudSun;
  return Sun;
}

export function HourStrip({
  hours,
  /** Index of the hour that changes the traveler's day. */
  peakIndex,
  className,
}: {
  hours: Hour[];
  peakIndex?: number;
  className?: string;
}) {
  if (hours.length === 0) return null;

  return (
    <ul className={cn('hour-strip', className)}>
      {hours.map((hour, index) => {
        const Icon = iconFor(hour.code);
        const peak = index === peakIndex;
        return (
          <li key={`${hour.label}-${index}`} className={cn('hour-cell', peak && 'hour-cell-peak')}>
            <span className="block font-mono text-[10px] uppercase tracking-wider text-white/50">
              {hour.label}
            </span>
            <Icon
              size={17}
              strokeWidth={1.9}
              aria-hidden="true"
              className={cn('mx-auto my-1.5', peak ? 'text-gold-light' : 'text-white/70')}
            />
            <span
              className={cn(
                'block font-mono text-sm',
                peak ? 'font-semibold text-white' : 'text-white/75'
              )}
            >
              {Math.round(hour.temperatureC)}°
            </span>
          </li>
        );
      })}
    </ul>
  );
}
