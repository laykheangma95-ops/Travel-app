'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Camera, Copy, Check, Download, ImagePlus, Share2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { slugToTitle } from '@/lib/utils';

// Demo memories — served from trip_memories in Supabase once connected.
const demoMemories = [
  { id: '1', emoji: '🛕', caption: 'Wat Arun at sunset', location: 'Bangkok' },
  { id: '2', emoji: '🍜', caption: 'Best boat noodles ever', location: 'Chatuchak' },
  { id: '3', emoji: '🌇', caption: 'Rooftop view', location: 'Sukhumvit' },
  { id: '4', emoji: '🏝️', caption: 'Day trip to the islands', location: 'Pattaya' },
  { id: '5', emoji: '🛍️', caption: 'Market finds', location: 'Pratunam' },
  { id: '6', emoji: '✈️', caption: 'Heading home', location: 'BKK Airport' },
];

const tripStats = {
  dates: '12–15 Jul 2026',
  esimDataUsed: '5.4 GB',
  flights: 2,
  placesVisited: 6,
};

export default function TripMemoriesPage() {
  const params = useParams<{ tripId: string }>();
  const tripTitle = slugToTitle(params.tripId);
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://domnerapp.com/memories/${params.tripId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the URL is visible for manual copy.
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {/* Trip summary card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-secondary to-primary p-8 text-white sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Trip Memory</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{tripTitle} 🇹🇭</h1>
          <p className="mt-1.5 text-sm text-white/70">
            My {tripStats.flights + 2} days in Thailand with Domner App
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Dates', value: tripStats.dates },
              { label: 'eSIM data used', value: tripStats.esimDataUsed },
              { label: 'Flights', value: String(tripStats.flights) },
              { label: 'Places visited', value: String(tripStats.placesVisited) },
            ].map((s) => (
              <div key={s.label} className="glass-panel rounded-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/50">{s.label}</p>
                <p className="mt-1 font-display text-sm font-bold sm:text-base">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-8 py-5">
          <p className="break-all font-mono text-xs text-ink-muted">{shareUrl}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="outline" size="sm">
              <Download size={14} /> Download as image
            </Button>
            <Button size="sm">
              <Share2 size={14} /> Share
            </Button>
          </div>
        </div>
      </Card>

      {/* Photo grid */}
      <div className="mt-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Camera size={19} className="text-accent" aria-hidden="true" /> Photos & moments
          </h2>
          <Button variant="outline" size="sm">
            <ImagePlus size={14} /> Upload photos
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {demoMemories.map((m) => (
            <figure
              key={m.id}
              className="group relative aspect-square overflow-hidden rounded-card border border-line/60 bg-gradient-to-br from-surface-3 to-line shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <span
                className="flex h-full w-full items-center justify-center text-6xl transition-transform duration-300 group-hover:scale-110"
                role="img"
                aria-label={m.caption}
              >
                {m.emoji}
              </span>
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary/90 to-transparent p-4 pt-10">
                <p className="text-sm font-semibold text-white">{m.caption}</p>
                <p className="text-xs text-white/70">{m.location}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
