'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, Loader2, MapPinned, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ItineraryEditor } from './ItineraryEditor';

type Mode = 'choose' | 'manual' | 'generating';

export function ItineraryStartView({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setMode('generating');
    try {
      const response = await fetch('/api/travel/itinerary/' + tripId + '/generate', {
        method: 'POST',
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not generate itinerary.');
      router.push('/trips/' + tripId + '/itinerary?mode=manual');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate itinerary.');
      setMode('choose');
    }
  }

  if (mode === 'manual') return <ItineraryEditor tripId={tripId} />;

  return (
    <div className="night-canvas has-tabbar relative min-h-screen pb-20 text-white">
      <div className="night-stars" aria-hidden="true" />
      <main className="relative mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold-light">Build your itinerary</p>
        <h1 className="mt-2 max-w-xl font-display text-3xl leading-tight sm:text-5xl">
          How would you like to plan this trip?
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
          Start with your own ideas, or let Domner arrange a thoughtful first draft from the places you saved and our local recommendations.
        </p>

        {error && <p className="mt-5 rounded-btn border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}

        <section className="mt-9 grid gap-4 md:grid-cols-2" aria-label="Itinerary planning options">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <div className="flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#1d4b5b] via-[#275b65] to-[#d7ad68] p-5">
              <MapPinned size={42} className="text-white/90" strokeWidth={1.5} />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">Your canvas</span>
            </div>
            <div className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">For the hands-on planner</p>
              <h2 className="mt-2 font-display text-2xl">Create it yourself</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">Add saved places to ideas, make days, and arrange every stop in the order that feels right.</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">Start from scratch <ArrowRight size={16} /></span>
            </div>
          </button>

          <button
            type="button"
            onClick={generate}
            disabled={mode === 'generating'}
            className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-wait"
          >
            <div className="relative flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#282b52] via-[#644d78] to-[#d47e68] p-5">
              <Sparkles size={42} className="text-gold-bright" strokeWidth={1.5} />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">AI-assisted</span>
            </div>
            <div className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">For the inspired explorer</p>
              <h2 className="mt-2 font-display text-2xl">Generate with AI</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">Get a first draft built from saved places and locally curated recommendations. Edit everything afterward.</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">
                {mode === 'generating' ? <><Loader2 size={16} className="animate-spin" /> Building your draft…</> : <>Dream it up <ArrowRight size={16} /></>}
              </span>
            </div>
          </button>
        </section>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">
          <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-gold-light" /> Change it anytime</span>
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-gold-light" /> Add dates later</span>
          <span className="inline-flex items-center gap-1.5"><Sparkles size={14} className="text-gold-light" /> AI suggestions stay editable</span>
        </div>
      </main>
    </div>
  );
}
