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

// Google Translate TTS language codes per phrase language.
const GOOGLE_TTS_LANG: Record<string, string> = {
  vi: 'vi',
  th: 'th',
  zh: 'zh-CN',
  ja: 'ja',
  en: 'en',
};

export default function EmergencyPhrasesPage() {
  const [langCode, setLangCode] = useState('vi');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      audioRef.current?.pause();
    };
  }, []);

  const stopAllAudio = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingId(null);
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

  // Fallback: stream spoken audio from Google Translate. Used when the
  // device has no built-in voice for the destination language (very common
  // for Vietnamese/Thai on desktop browsers).
  const playGoogleTts = useCallback(
    (id: string, text: string) => {
      const tl = GOOGLE_TTS_LANG[lang.code] ?? lang.speechLang.slice(0, 2);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => {
        setSpeakingId(null);
        setTtsUnavailable(true);
      };
      audio
        .play()
        .then(() => setSpeakingId(id))
        .catch(() => {
          setSpeakingId(null);
          setTtsUnavailable(true);
        });
    },
    [lang.code, lang.speechLang]
  );

  const speakPhrase = useCallback(
    (id: string, text: string) => {
      // Tapping the phrase that's currently playing stops it.
      if (speakingId === id) {
        stopAllAudio();
        return;
      }
      stopAllAudio();
      setTtsUnavailable(false);

      const synth =
        typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

      // Look for a device voice that truly matches the destination language.
      const base = lang.speechLang.slice(0, 2).toLowerCase();
      const voices = synth ? (voicesRef.current.length ? voicesRef.current : synth.getVoices()) : [];
      const voice =
        voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.speechLang.toLowerCase()) ??
        voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));

      // No matching device voice → use Google Translate audio instead of
      // letting the browser mispronounce it with an English voice (or play
      // nothing at all).
      if (!synth || !voice) {
        playGoogleTts(id, text);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = lang.speechLang;
      utterance.rate = 0.85; // slightly slower so locals hear it clearly
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => playGoogleTts(id, text); // device voice failed mid-way
      synth.speak(utterance);
      setSpeakingId(id);
    },
    [lang.speechLang, speakingId, stopAllAudio, playGoogleTts]
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
              stopAllAudio();
              setTtsUnavailable(false);
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
          Voice playback needs an internet connection or a device voice for this language. The copy
          button still works — show the phrase on your screen instead.
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
        Voice playback uses your device&apos;s built-in speech voices when available, and Google
        Translate audio otherwise. Phrases and copying always work offline.
      </p>
    </div>
  );
}
