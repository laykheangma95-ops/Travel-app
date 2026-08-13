'use client';

// AI Trip Copilot — a Khmer-first chat assistant floating over every page.
// Powered by Domner's own in-app engine via /api/chat (lib/domnerEngine.ts) —
// no external AI provider, no API key, no credits. Picks up the current flight
// (if the traveler is on a flight detail page) so answers can reference it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Send } from 'lucide-react';
import { DomerMark } from '@/components/brand/DomerMark';
import { useLang } from '@/lib/i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Dragging the button ──────────────────────────────────────────────────────
//
// The FAB sat on top of the last tab and made "You" almost impossible to hit.
// Two fixes, and the first matters more than the second: its default position
// now clears the tab bar (see .copilot-fab in globals.css), so the bug is gone
// even for someone who never discovers dragging. Dragging is what lets a
// traveler move it off whatever ELSE it covers on a given screen.
//
// It snaps to the nearest side edge on release rather than staying wherever it
// was dropped. A button parked mid-screen covers content and looks broken; the
// edge is where a floating control belongs, and snapping means the traveler
// only has to be roughly accurate.
//
// The position is remembered, kept as a side plus a fraction of the usable
// height rather than raw pixels, so rotating the phone or opening the keyboard
// does not fling it off-screen.

const FAB_SIZE = 56;
const EDGE_GAP = 12;
/** Keeps the button clear of the top navbar. */
const TOP_INSET = 76;
/** Movement past this many pixels is a drag, anything less is a tap. */
const DRAG_THRESHOLD = 6;
/** How far one arrow-key press moves it, for anyone who cannot drag. */
const KEY_STEP = 24;

const STORAGE_KEY = 'domner-copilot-position';

interface Position {
  x: number;
  y: number;
}

interface StoredPosition {
  side: 'left' | 'right';
  /** 0–1 down the usable vertical space, so it survives a resize. */
  yRatio: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * The rectangle the button may live in. The tab bar's height is measured from
 * the DOM rather than hardcoded — it is absent on desktop and taller on phones
 * with a home indicator, and a guessed number would be wrong on both.
 */
function readBounds(): Bounds {
  const tabbar = document.querySelector('.tabbar');
  const tabbarHeight = tabbar ? tabbar.getBoundingClientRect().height : 0;

  return {
    minX: EDGE_GAP,
    maxX: Math.max(EDGE_GAP, window.innerWidth - FAB_SIZE - EDGE_GAP),
    minY: TOP_INSET,
    maxY: Math.max(
      TOP_INSET,
      window.innerHeight - FAB_SIZE - EDGE_GAP - tabbarHeight
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toPosition(stored: StoredPosition, bounds: Bounds): Position {
  return {
    x: stored.side === 'left' ? bounds.minX : bounds.maxX,
    y: bounds.minY + stored.yRatio * (bounds.maxY - bounds.minY),
  };
}

function toStored(position: Position, bounds: Bounds): StoredPosition {
  const span = bounds.maxY - bounds.minY;
  return {
    side: position.x + FAB_SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right',
    yRatio: span > 0 ? clamp((position.y - bounds.minY) / span, 0, 1) : 0,
  };
}

function readStored(): StoredPosition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPosition>;
    if (parsed.side !== 'left' && parsed.side !== 'right') return null;
    if (typeof parsed.yRatio !== 'number' || Number.isNaN(parsed.yRatio)) return null;
    return { side: parsed.side, yRatio: clamp(parsed.yRatio, 0, 1) };
  } catch {
    // Private mode, disabled storage, or hand-edited junk. The CSS default is
    // a perfectly good position — there is nothing to report.
    return null;
  }
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

  // null means "wherever the stylesheet puts it" — the default, and the state
  // for anyone who never drags. Only a real move produces coordinates.
  const [position, setPosition] = useState<Position | null>(null);
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    grabX: number;
    grabY: number;
    moved: boolean;
  } | null>(null);
  /** Set when a pointer sequence turned out to be a drag, so the click that
   *  follows does not also open the panel. */
  const suppressClickRef = useRef(false);

  const persist = useCallback((next: Position) => {
    const stored = toStored(next, readBounds());
    setSide(stored.side);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage unavailable. The button still moved; it just will not be
      // remembered, which is not worth interrupting anyone over.
    }
  }, []);

  // Restore before paint so the button does not visibly jump from the CSS
  // default to the remembered spot.
  useLayoutEffect(() => {
    const stored = readStored();
    if (!stored) return;
    setSide(stored.side);
    setPosition(toPosition(stored, readBounds()));
  }, []);

  // Rotating the phone or opening the keyboard changes the usable area. Re-derive
  // from the stored ratio so the button stays proportionally where it was put,
  // instead of ending up under the tab bar or off the edge.
  useEffect(() => {
    if (!position) return;

    const onResize = () => {
      const stored = readStored();
      const bounds = readBounds();
      setPosition(
        stored
          ? toPosition(stored, bounds)
          : (current) =>
              current && {
                x: clamp(current.x, bounds.minX, bounds.maxX),
                y: clamp(current.y, bounds.minY, bounds.maxY),
              }
      );
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Ignore right-clicks and anything that is not a primary press.
    if (event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const bounds = readBounds();
    const next = {
      x: clamp(event.clientX - drag.grabX, bounds.minX, bounds.maxX),
      y: clamp(event.clientY - drag.grabY, bounds.minY, bounds.maxY),
    };

    if (!drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      const travelled = Math.hypot(next.x - rect.left, next.y - rect.top);
      if (travelled < DRAG_THRESHOLD) return;
      drag.moved = true;
      setDragging(true);
    }

    setPosition(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!drag.moved) return; // A tap. Let the click handler open the panel.

    suppressClickRef.current = true;
    setDragging(false);

    // Snap to whichever side it is nearest, keeping its height.
    const bounds = readBounds();
    setPosition((current) => {
      if (!current) return current;
      const snapped = {
        x:
          current.x + FAB_SIZE / 2 < window.innerWidth / 2 ? bounds.minX : bounds.maxX,
        y: clamp(current.y, bounds.minY, bounds.maxY),
      };
      persist(snapped);
      return snapped;
    });
  };

  /**
   * Arrow keys move the button for anyone who cannot drag — a keyboard, a
   * switch, or a screen reader's virtual cursor. Nothing else happens on a
   * focused button when these are pressed, so claiming them costs nothing.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    const bounds = readBounds();
    const rect = event.currentTarget.getBoundingClientRect();
    const from = position ?? { x: rect.left, y: rect.top };
    const next = {
      x: clamp(from.x + delta[0], bounds.minX, bounds.maxX),
      y: clamp(from.y + delta[1], bounds.minY, bounds.maxY),
    };
    setPosition(next);
    persist(next);
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
        onClick={() => {
          // A drag ends in a click too. Swallow that one so moving the button
          // does not also open the panel.
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setOpen((v) => !v);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        aria-label={open ? 'Close Domner Copilot' : 'Open Domner Copilot'}
        aria-describedby="copilot-drag-hint"
        data-liquid=""
        // touch-none: without it the browser claims the gesture for scrolling
        // and pointermove stops firing mid-drag.
        //
        // [backdrop-filter:none]: the blur is invisible on this opaque gold FAB
        // but rendered a square halo behind the circle (Chromium backdrop-filter
        // + border-radius clipping bug), so we disable it here.
        // z-[95] puts it above the panel (z-[90]). The button is also the close
        // button, so once it can be dragged anywhere it must never end up
        // underneath the panel it opened, with no way to dismiss it.
        className={`liquid-glass-accent liquid-sheen liquid-touch fixed z-[95] flex h-14 w-14 touch-none items-center justify-center rounded-full text-white shadow-lg [backdrop-filter:none] [-webkit-backdrop-filter:none] ${
          position ? '' : 'copilot-fab'
        } ${dragging ? 'scale-105 cursor-grabbing' : 'copilot-fab-settling liquid-press cursor-grab hover:scale-105'}`}
        style={
          position
            ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
            : undefined
        }
      >
        {open ? <X size={22} /> : <Sparkles size={22} aria-hidden="true" />}
        <span id="copilot-drag-hint" className="sr-only">
          {lang === 'km'
            ? 'អាចអូសដើម្បីផ្លាស់ទី ឬប្រើគ្រាប់ចុចព្រួញ'
            : 'Draggable. Use the arrow keys to move it.'}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Domner Trip Copilot"
          // The panel follows the button to whichever side it was parked on, but
          // stays anchored to the bottom rather than to the button's height: it
          // is 70vh tall, so tracking a button dragged near the top would push
          // it off the bottom of the screen.
          className={`copilot-panel fixed z-[90] flex h-[70vh] max-h-[560px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-card border border-white/10 bg-[#0E1B30]/95 shadow-2xl backdrop-blur-xl animate-fade-up ${
            side === 'left' ? 'left-5' : 'right-5'
          }`}
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
