'use client';

// AI Trip Copilot — a Khmer-first chat assistant floating over every page.
// Powered by Domner's own in-app engine via /api/chat (lib/domnerEngine.ts) —
// no external AI provider, no API key, no credits. Picks up the current flight
// (if the traveler is on a flight detail page) so answers can reference it.

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Send } from 'lucide-react';
import { DomerMark } from '@/components/brand/DomerMark';
import { useLang } from '@/lib/i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS_EN = [
  'What can I carry on a flight?',
  'How does my eSIM work?',
  'Give me 3 emergency Khmer phrases',
];

const SUGGESTIONS_KM = [
  'តើអាចយកអ្វីខ្លះឡើងយន្តហោះ?',
  'eSIM របស់ខ្ញុំដំណើរការដូចម្តេច?',
  'ប្រយោគសង្គ្រោះបន្ទាន់ជាភាសាខ្មែរ',
];

interface FlightSummary {
  flightNumber: string;
  departure: { airport: string };
  arrival: { airport: string };
  status: string;
  delayMinutes?: number;
  departureGate?: string;
}

export function TripCopilot() {
  const pathname = usePathname();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [flightSummary, setFlightSummary] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flightMatch = pathname?.match(/\/flights\/([^/?]+)/);
  const flightNumber = flightMatch ? decodeURIComponent(flightMatch[1]) : null;

  // Pick up live context for the flight the traveler is currently viewing.
  useEffect(() => {
    if (!open || !flightNumber) {
      setFlightSummary(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/flights?number=${encodeURIComponent(flightNumber)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FlightSummary | null) => {
        if (cancelled || !data) return;
        const parts = [
          `Flight ${data.flightNumber}`,
          `${data.departure.airport} → ${data.arrival.airport}`,
          `status: ${data.status}`,
        ];
        if (data.delayMinutes) parts.push(`delayed ${data.delayMinutes} min`);
        setFlightSummary(parts.join(', '));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, flightNumber]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: { flightNumber, flightSummary } }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      setMessages([
        ...next,
        { role: 'assistant', content: data.reply ?? data.error ?? 'Sorry, something went wrong.' },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: lang === 'km' ? 'សូមទោស មានបញ្ហាបណ្ដាញ។' : 'Sorry, a network error occurred.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = lang === 'km' ? SUGGESTIONS_KM : SUGGESTIONS_EN;

  // The Apsara hero is a standalone full-screen page — keep the FAB off it.
  if (pathname === '/apsara-hero') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Domner Copilot' : 'Open Domner Copilot'}
        data-liquid=""
        // [backdrop-filter:none]: the blur is invisible on this opaque gold FAB
        // but rendered a square halo behind the circle (Chromium backdrop-filter
        // + border-radius clipping bug), so we disable it here.
        className="liquid-glass-accent liquid-sheen liquid-touch liquid-press fixed bottom-5 right-5 z-[90] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg hover:scale-105 [backdrop-filter:none] [-webkit-backdrop-filter:none]"
      >
        {open ? <X size={22} /> : <Sparkles size={22} aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Domner Trip Copilot"
          className="fixed bottom-24 right-5 z-[90] flex h-[70vh] max-h-[560px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-card border border-white/10 bg-[#0E1B30]/95 shadow-2xl backdrop-blur-xl animate-fade-up"
        >
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3.5">
            <DomerMark surface="gold" size={24} />
            <div>
              <p className="font-display text-sm font-bold text-white">Domner Copilot</p>
              <p className="font-khmer text-[11px] text-white/50">ជំនួយការធ្វើដំណើររបស់អ្នក</p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-white/50">
                  {lang === 'km'
                    ? 'សួស្តី! សួរខ្ញុំអំពីជើងហោះហើរ eSIM ឬអាកាសយានដ្ឋានរបស់អ្នក។'
                    : "Hi! Ask me about your flight, eSIM, or the airport."}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-card px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-white/10 text-white' : 'bg-accent/15 text-white/90'
                  }`}
                >
                  {m.content}
                </p>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <p className="rounded-card bg-accent/15 px-3.5 py-2.5 text-sm text-white/50">···</p>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim() && !loading) void send(input.trim());
            }}
            className="flex items-center gap-2 border-t border-white/10 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={lang === 'km' ? 'សរសេរសំណួររបស់អ្នក...' : 'Ask a question...'}
              aria-label="Message"
              className="flex-1 rounded-btn border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="liquid-glass-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 [backdrop-filter:none] [-webkit-backdrop-filter:none]"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
