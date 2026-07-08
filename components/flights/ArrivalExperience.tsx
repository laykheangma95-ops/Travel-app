'use client';

// Full-screen welcome card, auto-triggered when a saved flight's status
// changes to "landed" (push notification opens this view).

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { FlightStatus } from '@/types';
import { getDestination } from '@/data/destinations';

const AIRPORT_TO_DESTINATION: Record<string, string> = {
  BKK: 'thailand',
  DMK: 'thailand',
  SGN: 'vietnam',
  HAN: 'vietnam',
  SIN: 'singapore',
  NRT: 'japan',
  ICN: 'south-korea',
  KUL: 'malaysia',
  PEK: 'china',
  PVG: 'china',
};

export function ArrivalExperience({ flight }: { flight: FlightStatus }) {
  const arr = flight.arrival;
  const destSlug = AIRPORT_TO_DESTINATION[arr.airport];
  const dest = destSlug ? getDestination(destSlug) : undefined;

  const localTime = (() => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: arr.timezone,
      }).format(new Date());
    } catch {
      return '—';
    }
  })();

  const rows = [
    dest && {
      icon: '💵',
      title: 'Exchange rate today:',
      body: `$1 USD = ${dest.usdRate.toLocaleString()} ${dest.currency}`,
    },
    {
      icon: '📋',
      title: 'Immigration tip:',
      body: 'Tell the officer you are a tourist. Show your hotel booking if asked. Maximum stay: 30 days.',
    },
    {
      icon: '🧳',
      title: 'Your baggage:',
      body: `Look for belt ${arr.baggageBelt ? `number ${arr.baggageBelt}` : 'number on the screens'} in the baggage hall. Flight ${flight.flightNumber.replace(/\s+/g, '')} bags usually take 20-25 minutes.`,
    },
    {
      icon: '🚕',
      title: 'Getting to your hotel safely:',
      body: 'Use the OFFICIAL taxi counter only. It is past the baggage claim exit, on your LEFT side. Avoid strangers offering rides.',
    },
  ].filter(Boolean) as { icon: string; title: string; body: string }[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="overflow-hidden rounded-card border border-line/60 bg-white shadow-card-hover"
    >
      <div className="bg-gradient-to-br from-secondary to-primary px-8 py-10 text-center text-white">
        <motion.p
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="text-5xl"
        >
          🎉
        </motion.p>
        <h2 className="mt-4 font-display text-3xl font-bold">Welcome to {arr.city}!</h2>
        <p className="mt-3 text-sm text-white/70">
          Current time: <span className="font-mono font-semibold text-white">{localTime}</span> {arr.city} time
        </p>
        <p className="mt-1 text-sm text-white/70">Weather: ⛅ 31°C, partly cloudy</p>
      </div>

      <div className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.title} className="flex gap-4 px-8 py-5">
            <span className="text-2xl" aria-hidden="true">{row.icon}</span>
            <div>
              <p className="text-sm font-bold text-ink">{row.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{row.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 bg-surface-2 px-8 py-5">
        <p className="text-sm text-ink">
          📱 <strong>Your eSIM is active.</strong>
        </p>
        <Link
          href="https://t.me/domnerapp"
          className="rounded-btn bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
        >
          Khmer support →
        </Link>
      </div>
    </motion.div>
  );
}
