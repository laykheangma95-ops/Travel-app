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

// Drag-to-move for the floating button. The FAB sits over every page, so it
// will always cover *something* — travelers need to be able to shove it out of
// the way. Position is kept in px from the viewport's top-left and remembered
// between visits; `null` means "unmoved", i.e. the default bottom-right corner.
interface Point {
  x: number;
  y: number;
}

const FAB_SIZE = 56; // h-14/w-14
const EDGE = 12; // keep this much clear of every edge
const DRAG_THRESHOLD = 4; // px of travel before a tap counts as a drag
const POS_KEY = 'domner:copilot-pos';

const FOCUSED_ROUTE_PREFIXES = [
  '/admin',
  '/auth/callback',
  '/cart',
  '/esim/checkout',
  '/forgot-password',
  '/order-confirmation',
  '/reset-password',
  '/sign-in',
  '/sign-up',
];

const routeBottomInset = (pathname?: string | null): number => {
  if (!pathname) return 84;
  if (/^\/trips\/[^/]+\/itinerary(?:\/)?$/.test(pathname)) return 112;
  if (
    pathname === '/' ||
    pathname.startsWith('/destination/') ||
    FOCUSED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return 20;
  }
  return 84;
};

const shouldHideCopilot = (pathname?: string | null): boolean =>
  pathname === '/apsara-hero' ||
  FOCUSED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));

const clampToViewport = (p: Point, bottomInset = EDGE): Point => ({
  x: Math.min(Math.max(p.x, EDGE), Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE)),
  y: Math.min(Math.max(p.y, EDGE), Math.max(EDGE, window.innerHeight - FAB_SIZE - Math.max(EDGE, bottomInset))),
});

export function TripCopilot() {
  const pathname = usePathname();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [flightSummary, setFlightSummary] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<Point | null>(null);
  const [viewport, setViewport] = useState<Point | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);
  const bottomInset = routeBottomInset(pathname);

  // Restore the remembered position, and keep the button on screen when the
  // window is resized or the phone is rotated.
  useEffect(() => {
    const readViewport = () => setViewport({ x: window.innerWidth, y: window.innerHeight });
    readViewport();

    try {
      const saved = window.localStorage.getItem(POS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Point>;
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPos(clampToViewport({ x: parsed.x, y: parsed.y }, bottomInset));
        }
      }
    } catch {
      // Corrupt or blocked storage just means the FAB starts in its corner.
    }

    const onResize = () => {
      readViewport();
      setPos((p) => (p ? clampToViewport(p, bottomInset) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bottomInset]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: false,
    };
    // Start from the current rendered spot so the first drag doesn't jump from
    // the corner-anchored layout to the pixel-anchored one.
    setPos((p) => p ?? { x: rect.left, y: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampToViewport({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }, bottomInset);
    setPos((prev) => {
      if (prev && !drag.moved) {
        const travelled = Math.hypot(next.x - prev.x, next.y - prev.y);
        if (travelled < DRAG_THRESHOLD) return prev;
        drag.moved = true;
      }
      return next;
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      // Swallow the click that follows the drag so a reposition never toggles
      // the panel open or shut.
      justDraggedRef.current = true;
      setPos((p) => {
        if (p) {
          try {
            window.localStorage.setItem(POS_KEY, JSON.stringify(p));
          } catch {
            // Private mode / storage disabled — the move still applies this session.
          }
        }
        return p;
      });
    }
  };

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
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
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

  // Once the button has been moved the panel has to follow it: it opens on
  // whichever side of the button has room, so it never hangs off the screen.
  const panelStyle: React.CSSProperties | undefined =
    pos && viewport
      ? {
          ...(pos.x + FAB_SIZE / 2 < viewport.x / 2
            ? { left: Math.max(EDGE, pos.x) }
            : { right: Math.max(EDGE, viewport.x - pos.x - FAB_SIZE) }),
          ...(pos.y + FAB_SIZE / 2 > viewport.y / 2
            ? { bottom: Math.max(EDGE, viewport.y - pos.y + EDGE) }
            : { top: pos.y + FAB_SIZE + EDGE }),
        }
      : undefined;

  // The Apsara hero is a standalone full-screen page — keep the FAB off it.
  if (shouldHideCopilot(pathname)) return null;

  const defaultFabStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: EDGE + 4, bottom: `calc(${bottomInset}px + env(safe-area-inset-bottom))` };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            return;
          }
          setOpen((v) => !v);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={open ? 'Close Domner Copilot' : 'Open Domner Copilot'}
        title={lang === 'km' ? 'អូសដើម្បីផ្លាស់ទី' : 'Drag to move'}
        data-liquid=""
        // touch-none: without it the browser claims the gesture for scrolling
        // and the button never receives pointermove, so it cannot be dragged.
        // [backdrop-filter:none]: the blur is invisible on this opaque gold FAB
        // but rendered a square halo behind the circle (Chromium backdrop-filter
        // + border-radius clipping bug), so we disable it here.
        className={`liquid-glass-accent liquid-sheen liquid-touch liquid-press fixed z-[90] flex h-14 w-14 touch-none items-center justify-center rounded-full text-white shadow-lg hover:scale-105 [backdrop-filter:none] [-webkit-backdrop-filter:none] ${
          pos ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={defaultFabStyle}
      >
        {open ? <X size={22} /> : <Sparkles size={22} aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Domner Trip Copilot"
          className={`fixed z-[90] flex h-[70vh] max-h-[560px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-card border border-white/10 bg-[#0E1B30]/95 shadow-2xl backdrop-blur-xl animate-fade-up ${
            panelStyle ? '' : 'bottom-24 right-5'
          }`}
          style={panelStyle ?? { right: EDGE + 4, bottom: `calc(${bottomInset + FAB_SIZE + 12}px + env(safe-area-inset-bottom))` }}
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
                      className="min-h-[2.75rem] rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
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
              className="min-h-[2.75rem] flex-1 rounded-btn border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="liquid-glass-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright [backdrop-filter:none] [-webkit-backdrop-filter:none]"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
