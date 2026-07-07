'use client';

// Emergency phrases — all data is bundled in the JS build, so once this page
// has loaded it keeps working with no internet connection. The speaker button
// uses the device's built-in text-to-speech voices (Web Speech API), so the
// phrase can be played out loud to a local person for help.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, Stamp, Map, HeartPulse, Compass, WifiOff, Volume2, VolumeX } from 'lucide-react';
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
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const lang = phraseLanguages.find((l) => l.code === langCode) ?? phraseLanguages[0];

  // Voices load asynchronously in most browsers.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const copyPhrase = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch {
      // Clipboard unavailable — phrase text remains selectable.
    }
  };

  const speakPhrase = useCallback(
    (id: string, text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setTtsUnavailable(true);
        return;
      }
      const synth = window.speechSynthesis;

      // Tapping the phrase that's currently playing stops it.
      if (speakingId === id) {
        synth.cancel();
        setSpeakingId(null);
        return;
      }
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang.speechLang;
      utterance.rate = 0.85; // slightly slower so locals hear it clearly

      // Prefer a voice that matches the destination language.
      const base = lang.speechLang.slice(0, 2).toLowerCase();
      const voice =
        voicesRef.current.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.speechLang.toLowerCase()) ??
        voicesRef.current.find((v) => v.lang.toLowerCase().startsWith(base));
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setSpeakingId(id);
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => {
        setSpeakingId(null);
        setTtsUnavailable(true);
      };
      synth.speak(utterance);
      setSpeakingId(id); // some browsers fire onstart late
    },
    [lang.speechLang, speakingId]
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Emergency Phrases</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Say it right, when it matters
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-ink-secondary">
          Tap <Volume2 size={14} className="inline text-accent" aria-hidden="true" /> to play the phrase out
          loud for a local person, or copy it and show your phone.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-success">
          <WifiOff size={13} aria-hidden="true" /> Phrases available without internet
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
            onClick={() => {
              setLangCode(l.code);
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
              setSpeakingId(null);
            }}
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

      {ttsUnavailable && (
        <p className="mb-8 flex items-center gap-2 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-ink">
          <VolumeX size={16} className="shrink-0 text-warning" aria-hidden="true" />
          Voice playback isn&apos;t available for this language on this device. The copy button still
          works — show the phrase on your screen instead.
        </p>
      )}

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
                  const speaking = speakingId === id;
                  return (
                    <div
                      key={id}
                      className={cn(
                        'flex w-full items-center justify-between gap-4 rounded-card border p-5 transition-all duration-200 ease-smooth',
                        speaking
                          ? 'border-accent bg-orange-50/60 shadow-card'
                          : copied
                            ? 'border-success bg-emerald-50'
                            : 'border-line/60 bg-white shadow-card hover:-translate-y-0.5 hover:border-secondary hover:shadow-card-hover'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">“{phrase.en}”</p>
                        <p className="font-khmer text-sm text-ink-secondary">{phrase.km}</p>
                        <p className="mt-2 text-lg font-medium text-secondary">{phrase.translation}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => speakPhrase(id, phrase.translation)}
                          aria-label={speaking ? `Stop playing "${phrase.en}"` : `Play "${phrase.en}" out loud in ${lang.name}`}
                          aria-pressed={speaking}
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-btn text-white transition-all duration-200 active:scale-95',
                            speaking ? 'animate-pulse-soft bg-secondary' : 'liquid-glass-accent liquid-sheen hover:brightness-110'
                          )}
                        >
                          <Volume2 size={18} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyPhrase(id, phrase.translation)}
                          aria-label={`Copy "${phrase.en}" in ${lang.name}`}
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-btn transition-all duration-200 active:scale-95',
                            copied
                              ? 'bg-success text-white'
                              : 'border border-line bg-white text-ink-secondary hover:border-secondary hover:text-secondary'
                          )}
                        >
                          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-center text-xs text-ink-muted">
        Voice playback uses your phone&apos;s built-in speech voices. For the best Vietnamese, Thai,
        Chinese, and Japanese voices, keep your phone&apos;s language packs installed.
      </p>
    </div>
  );
}
