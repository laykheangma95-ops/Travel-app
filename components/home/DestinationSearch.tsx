'use client';

/**
 * DestinationSearch — the single interactive element on the first screen.
 *
 * A floating glass field that expands on focus and drops a quiet list of
 * matches. Choosing one does NOT navigate: it hands the destination up to
 * HomeContent, which flies the globe there. The whole point is that nothing
 * ever cuts.
 *
 * Implements the ARIA combobox pattern (listbox popup, aria-activedescendant)
 * so the keyboard and screen-reader paths are equal to the mouse one:
 * ↑/↓ to move, Enter to fly, Escape to dismiss.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { profilesBySlug } from '@/data/destinationProfiles';
import { useLang } from '@/lib/i18n';
import type { Destination } from '@/types';

/** Extra spellings people actually type. The city and Khmer name come from the
 *  destination record itself, so only genuine aliases live here. */
const ALIASES: Record<string, string[]> = {
  usa: ['america', 'united states', 'us', 'new york', 'los angeles'],
  'united-kingdom': ['uk', 'britain', 'england', 'great britain', 'scotland'],
  'south-korea': ['korea', 'korea south'],
  'hong-kong': ['hk'],
  uae: ['emirates', 'united arab emirates', 'abu dhabi'],
  china: ['prc', 'beijing'],
  japan: ['nippon', 'kyoto', 'osaka'],
  netherlands: ['holland'],
  vietnam: ['viet nam', 'saigon', 'hanoi'],
  thailand: ['siam', 'phuket', 'chiang mai'],
  taiwan: ['formosa'],
  india: ['bharat', 'mumbai'],
  indonesia: ['bali', 'java'],
  australia: ['oz', 'melbourne'],
  philippines: ['pilipinas', 'cebu'],
  france: ['paris'],
  germany: ['deutschland', 'munich'],
  canada: ['vancouver'],
  singapore: ['sg'],
  malaysia: ['penang'],
  laos: ['lao', 'luang prabang'],
};

/** The four destinations offered as a starting point under the field. */
const OPENERS = ['japan', 'thailand', 'south-korea', 'singapore'];

interface Entry {
  dest: Destination;
  /** Everything this destination can be found by, lower-cased. */
  terms: string[];
  city: string;
}

function buildIndex(): Entry[] {
  return destinations.map((dest) => {
    const profile = profilesBySlug[dest.slug];
    const city = profile?.city ?? '';
    const terms = [
      dest.name,
      dest.nameKm,
      dest.slug.replace(/-/g, ' '),
      dest.region,
      city,
      ...(ALIASES[dest.slug] ?? []),
    ]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    return { dest, terms, city };
  });
}

function score(entry: Entry, q: string): number {
  let best = 0;
  for (const term of entry.terms) {
    if (term === q) return 100;
    if (term.startsWith(q)) best = Math.max(best, 80);
    else if (term.includes(q)) best = Math.max(best, 45);
  }
  // Popular routes break ties — a Cambodian traveller typing "s" means
  // Singapore far more often than Sweden.
  return best > 0 && entry.dest.popular ? best + 3 : best;
}

interface DestinationSearchProps {
  onSelect: (dest: Destination) => void;
}

export function DestinationSearch({ onSelect }: DestinationSearchProps) {
  const { t, lang } = useLang();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const index = useMemo(buildIndex, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .map((entry) => ({ entry, s: score(entry, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.entry.dest.name.localeCompare(b.entry.dest.name))
      .slice(0, 6)
      .map((r) => r.entry);
  }, [index, query]);

  useEffect(() => setActive(0), [query]);

  // Click-away closes the list but keeps whatever was typed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (dest: Destination) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    onSelect(dest);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active].dest);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className="dsearch">
      <div className="dsearch-field">
        <Search size={19} className="dsearch-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && results.length ? `${listId}-opt-${active}` : undefined
          }
          aria-label={t('home.search.label')}
          placeholder={t('home.search.placeholder')}
          className="dsearch-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="dsearch-clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label={t('home.search.clear')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {showList && (
        <ul className="dsearch-list" id={listId} role="listbox" aria-label={t('home.search.label')}>
          {results.length === 0 && (
            <li className="dsearch-empty" role="presentation">
              {t('home.search.none')}
            </li>
          )}
          {results.map((entry, i) => (
            <li
              key={entry.dest.slug}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`dsearch-opt${i === active ? ' dsearch-opt-on' : ''}`}
              onPointerEnter={() => setActive(i)}
              // pointerdown, not click: the click-away handler fires first
              // otherwise and the list is gone before the click lands.
              onPointerDown={(e) => {
                e.preventDefault();
                choose(entry.dest);
              }}
            >
              <span className="dsearch-flag" aria-hidden="true">
                {entry.dest.flag}
              </span>
              <span className="dsearch-name">
                {lang === 'km' ? entry.dest.nameKm : entry.dest.name}
              </span>
              <span className="dsearch-meta">{entry.city || entry.dest.region}</span>
            </li>
          ))}
        </ul>
      )}

      {/* A quiet way in for anyone who does not know what to type. Destination
          names only — no prices, no plans, nothing to buy on this screen. */}
      {!showList && (
        <p className="dsearch-openers">
          <span className="dsearch-openers-label">{t('home.search.hint')}</span>
          {OPENERS.map((slug) => {
            const dest = destinations.find((d) => d.slug === slug);
            if (!dest) return null;
            return (
              <button
                key={slug}
                type="button"
                className="dsearch-opener"
                onClick={() => choose(dest)}
              >
                {lang === 'km' ? dest.nameKm : dest.name}
              </button>
            );
          })}
        </p>
      )}
    </div>
  );
}
