'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { cn } from '@/lib/utils';

/**
 * The homepage's front door.
 *
 * Search is entirely local — all destinations ship in the bundle — so results
 * appear on the keystroke with no request, no spinner and no debounce. That is
 * the point: the first interaction with the product should feel instantaneous,
 * because it is the only evidence a first-time visitor has that the rest will
 * be fast too.
 *
 * Implemented as a proper combobox: arrow keys move an active option,
 * `aria-activedescendant` tells a screen reader which one it is, Enter opens
 * it, Escape closes. (The flight tracker's autocomplete is mouse-only — this
 * is the pattern that one should move to.)
 */
export function DestinationSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const popular = useMemo(() => destinations.filter((d) => d.popular).slice(0, 5), []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return destinations
      .filter((d) => d.name.toLowerCase().includes(q) || d.nameKm.includes(query.trim()))
      // Prefix matches first — typing "sing" should surface Singapore, not a
      // country that merely contains the letters somewhere in the middle.
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.name.localeCompare(b.name);
      })
      .slice(0, 6);
  }, [query]);

  const go = (slug: string) => {
    setOpen(false);
    router.push(`/esim/${slug}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = matches[activeIndex] ?? matches[0];
      if (pick) go(pick.slug);
    }
  };

  const showList = open && matches.length > 0;

  return (
    <div className="w-full max-w-xl">
      <div className="relative">
        <Search
          size={20}
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-white/45"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Search country, city or destination..."
          aria-label="Search for a destination"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
          className="h-[3.75rem] w-full rounded-full border border-white/20 bg-white/10 pl-14 pr-5 text-base text-white shadow-[0_18px_48px_rgba(2,8,23,0.35)] outline-none backdrop-blur-xl transition-all duration-300 ease-smooth placeholder:text-white/45 focus:border-gold-light/55 focus:bg-white/[0.14] focus:ring-2 focus:ring-gold-light/25"
        />

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching destinations"
            className="night-card absolute left-0 right-0 top-full z-40 mt-3 overflow-hidden p-2 text-left"
          >
            {matches.map((d, i) => (
              <li key={d.slug} role="none">
                <button
                  type="button"
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  // onMouseDown fires before the input's blur, so the click is
                  // not swallowed by the list unmounting first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(d.slug);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-btn px-3 py-3 text-left transition-colors duration-150',
                    i === activeIndex ? 'bg-white/12' : 'hover:bg-white/[0.08]'
                  )}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {d.flag}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{d.name}</span>
                    <span className="block truncate font-khmer text-xs text-white/55">{d.nameKm}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-gold-light/70" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Popular destinations. Driven by the `popular` flag in the catalogue so
          this row can never advertise a destination that is not bookable. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {popular.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => go(d.slug)}
            className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-4 py-2 text-sm text-white/85 backdrop-blur-md transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-gold-light/45 hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
          >
            <span className="text-base leading-none" aria-hidden="true">
              {d.flag}
            </span>
            {d.name}
          </button>
        ))}
      </div>
    </div>
  );
}
