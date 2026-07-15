'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, AlertTriangle, MessageSquare, PlaneTakeoff, PlaneLanding, Map, ExternalLink } from 'lucide-react';
import { airportGuides } from '@/data/airportGuides';
import { cn } from '@/lib/utils';
import type { AirportGuide } from '@/types';

function AirportGuideContent() {
  const searchParams = useSearchParams();
  const initial = searchParams.get('airport');
  const [selected, setSelected] = useState<AirportGuide | null>(
    () => airportGuides.find((a) => a.code === initial?.toUpperCase()) ?? null
  );
  const [mode, setMode] = useState<'departure' | 'arrival'>('departure');
  const [query, setQuery] = useState('');
  const [activeStep, setActiveStep] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return airportGuides;
    return airportGuides.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q)
    );
  }, [query]);

  const steps = selected ? (mode === 'departure' ? selected.departureSteps : selected.arrivalSteps) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Airport Companion</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
          Never feel lost at an airport again
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-secondary">
          Step-by-step guidance for every stage — check-in, security, immigration, gate, boarding.
        </p>
      </div>

      {/* Airport selection */}
      <div className="relative mx-auto mb-8 max-w-md">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search airports (e.g. PNH, Bangkok)…"
          aria-label="Search airports"
          className="w-full rounded-btn border border-line bg-white py-3 pl-11 pr-4 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
        />
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {filtered.map((airport) => (
          <button
            key={airport.code}
            type="button"
            onClick={() => {
              setSelected(airport);
              setActiveStep(0);
            }}
            className={cn(
              'rounded-card border-2 p-4 text-left transition-all duration-200 ease-smooth hover:-translate-y-0.5',
              selected?.code === airport.code
                ? 'border-accent bg-[#F5EEDC]/70 shadow-card'
                : 'border-line bg-white hover:border-ink-muted'
            )}
            aria-pressed={selected?.code === airport.code}
          >
            <p className="font-mono text-lg font-bold text-ink">
              {airport.flag} {airport.code}
            </p>
            <p className="mt-1 text-xs leading-snug text-ink-secondary">{airport.name}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="animate-fade-up">
          {/* Mode toggle */}
          <div className="mb-8 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('departure');
                setActiveStep(0);
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-btn px-5 py-2.5 text-sm font-semibold transition-all duration-200',
                mode === 'departure' ? 'bg-secondary text-white shadow-sm' : 'bg-white border border-line text-ink-secondary'
              )}
              aria-pressed={mode === 'departure'}
            >
              <PlaneTakeoff size={16} /> Departing
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('arrival');
                setActiveStep(0);
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-btn px-5 py-2.5 text-sm font-semibold transition-all duration-200',
                mode === 'arrival' ? 'bg-secondary text-white shadow-sm' : 'bg-white border border-line text-ink-secondary'
              )}
              aria-pressed={mode === 'arrival'}
            >
              <PlaneLanding size={16} /> Arriving
            </button>
          </div>

          <h2 className="mb-6 text-center font-display text-xl font-bold uppercase tracking-wide text-ink">
            {mode === 'departure' ? 'Departing from' : 'Arriving at'} {selected.city} ({selected.code})
          </h2>

          {/* Digital map — links to the airport's official / interactive terminal map */}
          {selected.digitalMapUrl && (
            <div className="mb-8 flex justify-center">
              <a
                href={selected.digitalMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
                aria-label={`Open the digital terminal map for ${selected.name}`}
              >
                <Map size={16} /> Digital Map
                <span className="hidden items-center gap-1 text-xs font-normal text-white/80 sm:inline-flex">
                  · {selected.digitalMapLabel ?? 'Interactive terminal map'}
                  <ExternalLink size={12} />
                </span>
              </a>
            </div>
          )}

          {/* Steps */}
          <ol className="relative space-y-4 border-l-2 border-line pl-8">
            {steps.map((step, i) => {
              const isActive = i === activeStep;
              const isDone = i < activeStep;
              return (
                <li key={step.title} className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveStep(i)}
                    className={cn(
                      'absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-200',
                      isDone
                        ? 'border-success bg-success text-white'
                        : isActive
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-white text-ink-muted'
                    )}
                    aria-label={`Step ${i + 1}: ${step.title}`}
                  >
                    {isDone ? '✓' : i + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStep(i)}
                    className={cn(
                      'w-full rounded-card border p-5 text-left transition-all duration-200 ease-smooth',
                      isActive ? 'border-accent bg-white shadow-card' : 'border-line/60 bg-surface-2 hover:bg-white'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display font-bold uppercase tracking-wide text-ink">
                        Step {i + 1} {isActive ? '●' : '○'} {step.title}
                      </h3>
                      {step.timing && (
                        <span className="shrink-0 rounded-full bg-surface-3 px-3 py-1 text-xs font-medium text-ink-secondary">
                          {step.timing}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <div className="mt-3 space-y-4 animate-fade-up">
                        <p className="text-sm leading-relaxed text-ink-secondary">{step.description}</p>
                        {step.phrases && step.phrases.length > 0 && (
                          <div className="rounded-btn bg-blue-50 p-4">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
                              <MessageSquare size={13} /> Useful phrases
                            </p>
                            {step.phrases.map((p) => (
                              <p key={p.label} className="text-sm text-ink">
                                “{p.label}” — <span className="font-khmer">{p.phrase}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {step.watchOut && (
                          <div className="rounded-btn bg-amber-50 p-4">
                            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
                              <AlertTriangle size={13} /> Watch out for
                            </p>
                            <p className="text-sm text-ink">{step.watchOut}</p>
                          </div>
                        )}
                        {i < steps.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStep(i + 1);
                            }}
                            className="rounded-btn bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110"
                          >
                            Done — next step →
                          </button>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function AirportGuidePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-12" aria-busy="true" />}>
      <AirportGuideContent />
    </Suspense>
  );
}
