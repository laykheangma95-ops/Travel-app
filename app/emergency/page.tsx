'use client';

// Emergency phrases — all data is bundled in the JS build, so once this page
// has loaded it keeps working with no internet connection.

import { useState } from 'react';
import { Copy, Check, Stamp, Map, HeartPulse, Compass, WifiOff } from 'lucide-react';
import { phraseLanguages } from '@/data/emergencyPhrases';
import { cn } from '@/lib/utils';

const categoryIcons: Record<string, typeof Stamp> = {
  immigration: Stamp,
  lost: Map,
  medical: HeartPulse,
  around: Compass,
};

export default function EmergencyPhrasesPage() {
  const [langCode, setLangCode] = useState('vi');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const lang = phraseLanguages.find((l) => l.code === langCode) ?? phraseLanguages[0];

  const copyPhrase = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch {
      // Clipboard unavailable — phrase text remains selectable.
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Emergency Phrases</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
          Say it right, when it matters
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-ink-secondary">
          Tap any phrase to copy it — then show your phone. Works offline.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-success">
          <WifiOff size={13} aria-hidden="true" /> Available without internet
        </p>
      </div>

      {/* Language selector */}
      <div className="mb-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Select destination language">
        {phraseLanguages.map((l) => (
          <button
            key={l.code}
            type="button"
            role="tab"
            aria-selected={langCode === l.code}
            onClick={() => setLangCode(l.code)}
            className={cn(
              'rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200',
              langCode === l.code
                ? 'bg-secondary text-white shadow-sm'
                : 'border border-line bg-white text-ink-secondary hover:border-secondary'
            )}
          >
            {l.flag} {l.name}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div className="space-y-8">
        {lang.categories.map((cat) => {
          const Icon = categoryIcons[cat.id] ?? Compass;
          return (
            <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
              <h2 id={`cat-${cat.id}`} className="mb-4 flex items-center gap-2.5 font-display text-lg font-bold text-ink">
                <span className="flex h-9 w-9 items-center justify-center rounded-card bg-orange-50">
                  <Icon size={18} className="text-accent" aria-hidden="true" />
                </span>
                {cat.title} <span className="font-khmer text-sm font-normal text-ink-muted">{cat.titleKm}</span>
              </h2>
              <div className="space-y-2.5">
                {cat.phrases.map((phrase, i) => {
                  const id = `${lang.code}-${cat.id}-${i}`;
                  const copied = copiedId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => copyPhrase(id, phrase.translation)}
                      className={cn(
                        'flex w-full items-center justify-between gap-4 rounded-card border p-5 text-left transition-all duration-200 ease-smooth',
                        copied
                          ? 'border-success bg-emerald-50'
                          : 'border-line/60 bg-white shadow-card hover:-translate-y-0.5 hover:border-secondary hover:shadow-card-hover'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">“{phrase.en}”</p>
                        <p className="font-khmer text-sm text-ink-secondary">{phrase.km}</p>
                        <p className="mt-2 text-lg font-medium text-secondary">{phrase.translation}</p>
                      </div>
                      <span
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-white transition-colors',
                          copied ? 'bg-success' : 'bg-accent'
                        )}
                        aria-hidden="true"
                      >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
