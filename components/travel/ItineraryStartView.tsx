'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, Loader2, MapPinned, Sparkles } from 'lucide-react';
import { ItineraryEditor } from './ItineraryEditor';

type Mode = 'choose' | 'manual' | 'generating';

export function ItineraryStartView({ tripId }: { tripId: string }) {
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setMode('generating');
    try {
      const responsePromise = fetch('/api/travel/itinerary/' + tripId + '/generate', {
        method: 'POST',
        credentials: 'include',
      });
      const delayPromise = new Promise((resolve) => window.setTimeout(resolve, 2400));
      const [response] = await Promise.all([responsePromise, delayPromise]);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not generate itinerary.');
      setMode('manual');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate itinerary.');
      setMode('choose');
    }
  }

  if (mode === 'manual') return <ItineraryEditor tripId={tripId} />;
  if (mode === 'generating') return <GeneratingView />;

  return (
    <div className="night-canvas has-tabbar relative min-h-screen pb-20 text-white">
      <div className="night-stars" aria-hidden="true" />
      <main className="relative mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold-light">Build your itinerary</p>
        <h1 className="mt-2 max-w-xl font-display text-3xl leading-tight sm:text-5xl">How would you like to plan this trip?</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">Start with your own ideas, or let Domner arrange a thoughtful first draft from the places you saved and our local recommendations.</p>
        {error && <p className="mt-5 rounded-btn border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}

        <section className="mt-9 grid gap-4 md:grid-cols-2" aria-label="Itinerary planning options">
          <button type="button" onClick={() => setMode('manual')} className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light">
            <div className="flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#1d4b5b] via-[#275b65] to-[#d7ad68] p-5"><MapPinned size={42} className="text-white/90" strokeWidth={1.5} /><span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">Your canvas</span></div>
            <div className="p-5"><p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">For the hands-on planner</p><h2 className="mt-2 font-display text-2xl">Create it yourself</h2><p className="mt-2 text-sm leading-relaxed text-white/60">Add saved places to ideas, make days, and arrange every stop in the order that feels right.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">Start from scratch <ArrowRight size={16} /></span></div>
          </button>

          <button type="button" onClick={generate} className="group night-card text-left transition duration-200 hover:-translate-y-1 hover:border-gold-light/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light">
            <div className="relative flex h-44 items-end justify-between overflow-hidden rounded-t-card bg-gradient-to-br from-[#282b52] via-[#644d78] to-[#d47e68] p-5"><Sparkles size={42} className="text-gold-bright" strokeWidth={1.5} /><span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/75">AI-assisted</span></div>
            <div className="p-5"><p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">For the inspired explorer</p><h2 className="mt-2 font-display text-2xl">Generate with AI</h2><p className="mt-2 text-sm leading-relaxed text-white/60">Get a first draft built from saved places and locally curated recommendations. Edit everything afterward.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright"><Sparkles size={16} />Dream it up <ArrowRight size={16} /></span></div>
          </button>
        </section>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45"><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-gold-light" /> Change it anytime</span><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-gold-light" /> Add dates later</span><span className="inline-flex items-center gap-1.5"><Sparkles size={14} className="text-gold-light" /> AI suggestions stay editable</span></div>
      </main>
    </div>
  );
}

function GeneratingView() {
  return (
    <div className="itinerary-ai-loading relative min-h-screen overflow-hidden text-[#1c252a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.96),rgba(239,229,211,.74)_52%,rgba(208,222,228,.9))]" />
      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-10 pt-10 sm:px-12 sm:pt-14">
        <div className="max-w-xs">
          <p className="text-4xl font-semibold leading-[.98] tracking-[-.06em] sm:text-5xl">One world.<br />Endless<br /><span className="text-[#b18436]">adventures.</span></p>
          <div className="mt-5 h-px w-52 bg-[#bd9956]" />
          <p className="mt-4 text-sm leading-relaxed text-black/60">Discover more.<br />Experience more.<br />Be more.</p>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-8">
          <div className="itinerary-landmark itinerary-landmark-eiffel">♜</div>
          <div className="itinerary-landmark itinerary-landmark-liberty">♟</div>
          <div className="itinerary-landmark itinerary-landmark-temple">⌂</div>
          <div className="itinerary-globe" aria-label="Building your itinerary">
            <div className="itinerary-globe-grid" />
            <div className="itinerary-globe-glow" />
            <span className="itinerary-globe-pin pin-one">•</span><span className="itinerary-globe-pin pin-two">•</span><span className="itinerary-globe-pin pin-three">•</span>
          </div>
          <div className="itinerary-flight-path path-one" /><div className="itinerary-flight-path path-two" />
        </div>

        <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/80 bg-white/55 p-5 shadow-[0_14px_50px_rgba(102,92,60,.1)] backdrop-blur-md sm:p-6">
          <div className="flex items-center justify-center gap-6 text-center text-[10px] font-semibold uppercase tracking-[.12em] text-[#94733a] sm:gap-12">
            <span>◎<b>Global<br />destinations</b></span><span>✈<b>Seamless<br />journeys</b></span><span>✧<b>Curated<br />experiences</b></span><span>✓<b>Trusted<br />service</b></span><span>▣<b>Memories<br />that last</b></span>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-black/65"><Loader2 size={16} className="animate-spin text-[#b18436]" /> Mapping your perfect days…</div>
        </div>
      </main>
    </div>
  );
}
