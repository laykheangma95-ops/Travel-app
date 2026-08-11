'use client';

import { useEffect, useState } from 'react';
import { Sparkles, PlaneLanding } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import type { DelayPrediction } from '@/lib/delayPrediction';

export function DelayIntelligence({ flightNumber, date }: { flightNumber: string; date: string }) {
  const { lang } = useLang();
  const [prediction, setPrediction] = useState<DelayPrediction | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/flights/predict?number=${encodeURIComponent(flightNumber)}&date=${date}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DelayPrediction | null) => {
        if (!cancelled) setPrediction(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [flightNumber, date]);

  if (!prediction || !prediction.available) return null;

  const isDelayRisk = prediction.predictedDelayMinutes > 0;
  const confidenceLabel = { high: 'Live tracking', medium: 'Schedule-based', low: 'Estimated' }[
    prediction.confidence
  ];

  return (
    <div className="liquid-glass mt-4 overflow-hidden rounded-card border border-accent/25 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
          {isDelayRisk ? (
            <PlaneLanding size={16} className="text-accent" aria-hidden="true" />
          ) : (
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
          )}
        </span>
        <div>
          <p className="font-display text-sm font-bold text-white">Domner Intelligence</p>
          <p className="text-[11px] text-white/40">
            {confidenceLabel} · inbound-aircraft rotation analysis
          </p>
        </div>
        {isDelayRisk && (
          <span className="ml-auto rounded-full bg-accent/20 px-2.5 py-1 text-xs font-bold text-gold-light">
            ~{prediction.predictedDelayMinutes} min
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-white/75">
        {lang === 'km' ? prediction.reasoningKm : prediction.reasoning}
      </p>

      {prediction.demo && (
        <p className="mt-3 text-[11px] text-white/35">
          ℹ️ Simulated — connect a RapidAPI key for real inbound-flight rotation data.
        </p>
      )}
    </div>
  );
}
