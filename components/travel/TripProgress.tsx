'use client';

// TripProgress — the five things a trip needs, and which are done.
//
// This is the component that makes the Planning home state useful. It is not a
// progress bar with a number on it: each step is a link to the screen that
// completes it, so "eSIM ○" is one tap from being "eSIM ✓". A checklist you
// cannot act on from where you read it is just an accusation.

import Link from 'next/link';
import { BedDouble, Check, ListChecks, MapPin, Plane, Signal } from 'lucide-react';
import { READINESS_STEPS, readinessPercent, type Readiness, type ReadinessStep } from '@/lib/travel/state';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const STEP_META: Record<
  ReadinessStep,
  { icon: typeof Plane; label: { en: string; km: string }; href: (tripId: string) => string }
> = {
  flight: {
    icon: Plane,
    label: { en: 'Flight', km: 'ជើងហោះហើរ' },
    href: () => '/flights',
  },
  stay: {
    icon: BedDouble,
    label: { en: 'Stay', km: 'ស្នាក់នៅ' },
    href: (tripId) => `/trips/${tripId}#stay`,
  },
  esim: {
    icon: Signal,
    label: { en: 'eSIM', km: 'eSIM' },
    href: () => '/esim',
  },
  places: {
    icon: MapPin,
    label: { en: 'Places', km: 'ទីតាំង' },
    href: (tripId) => `/trips/${tripId}#places`,
  },
  itinerary: {
    icon: ListChecks,
    label: { en: 'Itinerary', km: 'កម្មវិធី' },
    href: (tripId) => `/trips/${tripId}#itinerary`,
  },
};

export function TripProgress({
  readiness,
  tripId,
  className,
}: {
  readiness: Readiness;
  tripId: string;
  className?: string;
}) {
  const { lang } = useLang();
  const percent = readinessPercent(readiness);

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
          {lang === 'km' ? 'ការរៀបចំ' : 'Ready to go'}
        </p>
        <p className="font-mono text-xs text-white/60">{percent}%</p>
      </div>

      <div
        className="capsule-meter mt-2 text-gold-light"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={lang === 'km' ? 'ការរៀបចំដំណើរ' : 'Trip readiness'}
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {READINESS_STEPS.map((step) => {
          const meta = STEP_META[step];
          const done = readiness[step];
          const Icon = done ? Check : meta.icon;
          return (
            <li key={step}>
              <Link
                href={meta.href(tripId)}
                className={cn(
                  'flex min-h-[2.25rem] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
                  done
                    ? 'border-success/40 bg-success/12 text-[#6EE7B7]'
                    : 'border-white/15 bg-white/5 text-white/70 hover:border-gold-light/50 hover:text-white'
                )}
                // The visible label is the step name; the accessible name says
                // what tapping it will do, which is not the same sentence.
                aria-label={
                  done
                    ? `${meta.label[lang]} — ${lang === 'km' ? 'រួចរាល់' : 'done'}`
                    : `${lang === 'km' ? 'បន្ថែម' : 'Add'} ${meta.label[lang]}`
                }
              >
                <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
                {meta.label[lang]}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
