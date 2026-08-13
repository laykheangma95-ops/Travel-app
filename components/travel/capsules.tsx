'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The capsule family.
//
// Each of these is a thin, opinionated wrapper over <TravelCapsule/>: it knows
// what its subject means, decides the tone, writes the sentence, and picks the
// deep link. Nothing here re-implements the capsule surface, so a change to the
// glass recipe reaches all five at once.
//
// Every one is bilingual through useLang. `en` is the source of truth and `km`
// mirrors every string (CLAUDE.md §11).
// ─────────────────────────────────────────────────────────────────────────────

import {
  BedDouble,
  CloudRain,
  MapPin,
  PlaneTakeoff,
  QrCode,
  Signal,
  Sun,
} from 'lucide-react';
import { TravelCapsule, type CapsuleTone } from './TravelCapsule';
import { useLang } from '@/lib/i18n';

// ── Flight ───────────────────────────────────────────────────────────────────

export interface FlightCapsuleProps {
  flightNumber: string;
  /** e.g. 'Singapore' — where they are going, not the airport code. */
  destination?: string | null;
  status?: 'scheduled' | 'boarding' | 'delayed' | 'cancelled' | 'landed' | 'unknown';
  gate?: string | null;
  terminal?: string | null;
  /** Minutes until boarding. Negative means boarding has started. */
  minutesToBoarding?: number | null;
  /** ISO date, used when the flight is not today. */
  date?: string | null;
  loading?: boolean;
  index?: number;
}

/**
 * Tone follows what the traveler has to *do*, not how bad the news is: a
 * cancellation and a boarding call are both "drop what you are holding", so
 * both are urgent.
 */
function flightTone(props: FlightCapsuleProps): CapsuleTone {
  if (props.status === 'cancelled') return 'urgent';
  if (props.status === 'boarding') return 'urgent';
  if (props.status === 'delayed') return 'warning';
  if (props.minutesToBoarding !== null && props.minutesToBoarding !== undefined && props.minutesToBoarding <= 60) {
    return 'urgent';
  }
  if (props.status === 'landed') return 'success';
  return 'info';
}

export function FlightCapsule(props: FlightCapsuleProps) {
  const { lang } = useLang();
  const tone = flightTone(props);
  const minutes = props.minutesToBoarding;

  const headline = (() => {
    if (props.status === 'cancelled') {
      return lang === 'km' ? 'ជើងហោះហើរត្រូវបានលុបចោល' : 'Flight cancelled';
    }
    if (props.status === 'boarding') {
      return lang === 'km' ? 'កំពុងឡើងយន្តហោះ' : 'Boarding now';
    }
    if (typeof minutes === 'number' && minutes > 0) {
      return lang === 'km' ? `ឡើងយន្តហោះក្នុង ${minutes} នាទី` : `Boarding in ${minutes} min`;
    }
    if (props.status === 'delayed') {
      return lang === 'km' ? 'ពន្យារពេល' : 'Delayed';
    }
    if (props.status === 'landed') {
      return lang === 'km' ? 'បានចុះចតហើយ' : 'Landed';
    }
    return props.date
      ? new Date(`${props.date}T00:00:00Z`).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        })
      : lang === 'km'
        ? 'តាមដានជើងហោះហើរ'
        : 'Tracking your flight';
  })();

  const detail = [
    props.gate ? (lang === 'km' ? `ទ្វារ ${props.gate}` : `Gate ${props.gate}`) : null,
    props.terminal ? (lang === 'km' ? `អាគារ ${props.terminal}` : `Terminal ${props.terminal}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TravelCapsule
      eyebrow={props.destination ?? (lang === 'km' ? 'ជើងហោះហើរ' : 'Flight')}
      headline={headline}
      detail={detail || undefined}
      meta={props.flightNumber}
      icon={PlaneTakeoff}
      tone={tone}
      status={props.loading ? 'loading' : 'ready'}
      live={tone === 'urgent'}
      href={`/flights/${encodeURIComponent(props.flightNumber.replace(/\s+/g, ''))}`}
      index={props.index}
    />
  );
}

// ── eSIM ─────────────────────────────────────────────────────────────────────

export interface ESIMCapsuleProps {
  country: string;
  planName?: string;
  orderNumber?: string;
  /** GB left. Null when the supplier does not report usage yet. */
  remainingGb?: number | null;
  totalGb?: number | null;
  daysLeft?: number | null;
  /** 'ready' — bought, not yet installed. 'active' — live. */
  state: 'ready' | 'active' | 'expired' | 'missing';
  loading?: boolean;
  index?: number;
}

export function ESIMCapsule(props: ESIMCapsuleProps) {
  const { lang } = useLang();

  // "Missing" is a capsule too. The most valuable thing Domner can say the week
  // before a trip is that the connection is not sorted yet.
  if (props.state === 'missing') {
    return (
      <TravelCapsule
        eyebrow={lang === 'km' ? 'eSIM' : 'Domner eSIM'}
        headline={lang === 'km' ? 'អ្នកមិនទាន់មាន eSIM ទេ' : 'No eSIM for this trip yet'}
        detail={
          lang === 'km'
            ? `ភ្ជាប់អ៊ីនធឺណិតនៅ${props.country}ក្នុងពេលមកដល់`
            : `Land in ${props.country} already connected`
        }
        icon={Signal}
        tone="warning"
        href="/esim"
        index={props.index}
      />
    );
  }

  const pct =
    props.remainingGb !== null &&
    props.remainingGb !== undefined &&
    props.totalGb !== null &&
    props.totalGb !== undefined &&
    props.totalGb > 0
      ? Math.round((props.remainingGb / props.totalGb) * 100)
      : null;

  const tone: CapsuleTone =
    props.state === 'expired'
      ? 'quiet'
      : pct !== null && pct <= 15
        ? 'urgent'
        : pct !== null && pct <= 30
          ? 'warning'
          : props.state === 'active'
            ? 'success'
            : 'info';

  const headline =
    props.remainingGb !== null && props.remainingGb !== undefined
      ? lang === 'km'
        ? `នៅសល់ ${props.remainingGb.toFixed(1)} GB`
        : `${props.remainingGb.toFixed(1)} GB remaining`
      : props.state === 'ready'
        ? lang === 'km'
          ? 'រួចរាល់សម្រាប់ដំឡើង'
          : 'Ready to install'
        : props.state === 'expired'
          ? lang === 'km'
            ? 'ផុតកំណត់'
            : 'Expired'
          : lang === 'km'
            ? 'កំពុងដំណើរការ'
            : 'Active';

  const detail = [
    props.planName,
    props.daysLeft !== null && props.daysLeft !== undefined
      ? lang === 'km'
        ? `នៅសល់ ${props.daysLeft} ថ្ងៃ`
        : `${props.daysLeft} days left`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TravelCapsule
      eyebrow={`${lang === 'km' ? 'eSIM' : 'Domner eSIM'} · ${props.country}`}
      headline={headline}
      detail={detail || undefined}
      meta={pct !== null ? `${pct}%` : undefined}
      icon={props.state === 'ready' ? QrCode : Signal}
      tone={tone}
      status={props.loading ? 'loading' : 'ready'}
      meter={pct ?? undefined}
      // Dots, not a bar. Data left is the number a traveler abroad is actually
      // anxious about, and a grid you can count beats a proportion you have to
      // interpret.
      meterStyle="dots"
      href={
        props.orderNumber
          ? `/my-esims?order=${encodeURIComponent(props.orderNumber)}`
          : '/my-esims'
      }
      index={props.index}
    />
  );
}

// ── Weather ──────────────────────────────────────────────────────────────────

export interface WeatherCapsuleProps {
  place: string;
  temperatureC?: number | null;
  description?: string | null;
  /** Short note about what changes later: 'Rain around 5 PM'. */
  outlook?: string | null;
  /** True when the description is a rain/storm code — switches the icon. */
  wet?: boolean;
  loading?: boolean;
  /** Optional deep link. Weather with nowhere to go renders as a readout. */
  href?: string;
  index?: number;
}

export function WeatherCapsule(props: WeatherCapsuleProps) {
  const { lang } = useLang();

  return (
    <TravelCapsule
      eyebrow={`${lang === 'km' ? 'អាកាសធាតុ' : 'Weather'} · ${props.place}`}
      headline={
        props.temperatureC !== null && props.temperatureC !== undefined
          ? `${Math.round(props.temperatureC)}°`
          : lang === 'km'
            ? 'មិនមានទិន្នន័យ'
            : 'No reading'
      }
      detail={[props.description, props.outlook].filter(Boolean).join(' · ') || undefined}
      icon={props.wet ? CloudRain : Sun}
      tone="info"
      status={props.loading ? 'loading' : 'ready'}
      href={props.href}
      index={props.index}
    />
  );
}

// ── Hotel / stay ─────────────────────────────────────────────────────────────

export interface HotelCapsuleProps {
  name?: string | null;
  /** 'Check-in today', 'Check-out tomorrow' etc. is derived from these. */
  checkInDate?: string | null;
  checkInTime?: string | null;
  isToday?: boolean;
  href?: string;
  index?: number;
}

export function HotelCapsule(props: HotelCapsuleProps) {
  const { lang } = useLang();

  return (
    <TravelCapsule
      eyebrow={lang === 'km' ? 'សណ្ឋាគារ' : 'Stay'}
      headline={
        props.isToday
          ? lang === 'km'
            ? 'ចូលសណ្ឋាគារថ្ងៃនេះ'
            : 'Check-in today'
          : (props.name ?? (lang === 'km' ? 'កន្លែងស្នាក់នៅ' : 'Your stay'))
      }
      detail={
        [props.isToday ? props.name : null, props.checkInTime].filter(Boolean).join(' · ') || undefined
      }
      meta={props.checkInTime ?? undefined}
      icon={BedDouble}
      tone={props.isToday ? 'warning' : 'quiet'}
      href={props.href}
      index={props.index}
    />
  );
}

// ── Saved place ──────────────────────────────────────────────────────────────

export interface PlaceCapsuleProps {
  name: string;
  /** Free-text distance or travel time: '12 min away'. */
  distance?: string | null;
  city?: string | null;
  href?: string;
  index?: number;
}

export function PlaceCapsule(props: PlaceCapsuleProps) {
  const { lang } = useLang();

  return (
    <TravelCapsule
      eyebrow={lang === 'km' ? 'ជិតអ្នក' : 'Nearby'}
      headline={props.name}
      detail={[props.city, props.distance].filter(Boolean).join(' · ') || undefined}
      icon={MapPin}
      tone="quiet"
      href={props.href}
      index={props.index}
    />
  );
}
