'use client';

// The search field is the only control on the first screen, and it sells eSIMs.
//
//  • every row is a plan we can put on a phone today — a country, a regional
//    bundle, or the country a city sits in ("Guangzhou" answers with China,
//    "Paris" with France). Pressing one goes to that plan.
//  • it does not answer a shopping question with editorial. A destination we
//    have not written up is not a dead end here; it is a product, priced.
//  • for a returning visitor the last row is the express lane: their previous
//    eSIM, two taps from keystroke to checkout
//
// Fully keyboard operable: ↑ ↓ to move, Enter to commit, Escape to clear,
// "/" from anywhere on the page to focus. Implements the combobox pattern with
// aria-activedescendant so a screen reader hears the highlighted option.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { play } from '@/lib/sound';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { guides } from '@/content/destinations';
import { searchEsimProducts, type EsimProductHit } from '@/data/esimSearch';
import { useBi, useLang } from '@/lib/i18n';
import type { DestinationGuide } from '@/content/schema';

export interface SearchSelection {
  guide?: DestinationGuide;
  esimSlug?: string;
  esimName?: string;
}

export function DestinationSearch({
  onSelect,
  onPreview,
  autoFocus = false,
  compact = false,
  expressPlan,
}: {
  onSelect: (selection: SearchSelection) => void;
  /**
   * The globe answers while you type. As soon as what you have typed matches a
   * city, that city lights up on the planet — before you have committed to
   * anything, before you have pressed a key more. It is the cheapest way to
   * make the world feel like it is listening, and it turns typing from data
   * entry into a conversation.
   */
  onPreview?: (slug: string | null) => void;
  autoFocus?: boolean;
  compact?: boolean;
  /** Returning visitors only: their previous destination's plan, shown last. */
  expressPlan?: { label: string; priceUsd: number; onBuy: () => void } | null;
}) {
  const { t } = useLang();
  const bi = useBi();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const hits = useMemo(() => searchEsimProducts(query), [query]);
  const rowCount = hits.length + (expressPlan && hits.length ? 1 : 0);

  useEffect(() => setCursor(0), [query]);

  // Light whatever is currently under the cursor, and put it out when the list
  // closes. The globe can only light a city it has coordinates for, which means
  // the seven written-up ones — a plan whose country is one of them lights that
  // city, everything else simply leaves the planet as it is.
  useEffect(() => {
    if (!onPreview) return;
    const hit = open && query.trim() ? hits[cursor] : undefined;
    const lit = hit ? guides.find((g) => g.esimCountrySlug === hit.slug) : undefined;
    onPreview(lit?.slug ?? null);
  }, [hits, cursor, open, query, onPreview]);

  useEffect(() => () => onPreview?.(null), [onPreview]);

  // "/" focuses the field from anywhere, the way a search-first product should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commit = (index: number) => {
    if (expressPlan && index === hits.length) {
      expressPlan.onBuy();
      return;
    }
    const hit = hits[index];
    if (!hit) return;
    setOpen(false);
    setQuery('');
    onPreview?.(null);
    onSelect({ esimSlug: hit.slug, esimName: hit.name });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => {
        const next = rowCount ? (c + 1) % rowCount : 0;
        play('move', next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => {
        const next = rowCount ? (c - 1 + rowCount) % rowCount : 0;
        play('move', next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(cursor);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className={`v3-search ${compact ? 'v3-search-compact' : ''}`}>
      <div className="v3-search-field">
        <Search size={compact ? 16 : 19} className="v3-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && rowCount ? `${listId}-${cursor}` : undefined}
          aria-label={t('v3.searchLabel')}
          placeholder={t('v3.searchPlaceholder')}
          className="v3-search-input"
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            if (e.target.value.length > query.length) play('key');
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            play('focus');
          }}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className="v3-search-clear" onClick={() => setQuery('')} aria-label={t('v3.clear')}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {showList && (
        <ul className="v3-suggestions" id={listId} role="listbox" aria-label={t('v3.suggestions')}>
          {hits.length === 0 && (
            <li className="v3-suggestion-empty" role="presentation">
              {t('v3.noResults')}
            </li>
          )}
          {hits.map((hit: EsimProductHit, i) => (
            <li
              key={`esim-${hit.slug}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === cursor}
              className={`v3-suggestion ${i === cursor ? 'is-active' : ''}`}
              onMouseEnter={() => {
                if (i !== cursor) play('move', i);
                setCursor(i);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(i);
              }}
            >
              <span className="v3-suggestion-dot" aria-hidden="true" />
              <span className="v3-suggestion-body">
                <span className="v3-suggestion-name">
                  {/* The place they typed leads. When that was a city, the
                      country it resolved to sits beside it, so the join we
                      made is visible rather than surprising. */}
                  {hit.viaCity
                    ? bi({ en: hit.viaCity.name, km: hit.viaCity.nameKm ?? hit.viaCity.name })
                    : bi({ en: hit.name, km: hit.nameKm })}
                  {hit.viaCity && (
                    <span className="v3-suggestion-country">
                      {bi({ en: hit.name, km: hit.nameKm })}
                    </span>
                  )}
                </span>
                <span className="v3-suggestion-meta">
                  {t('v3.esimFrom')} ${hit.fromPriceUsd.toFixed(2)}
                </span>
              </span>
              {i === cursor && <CornerDownLeft size={14} className="v3-suggestion-enter" aria-hidden="true" />}
            </li>
          ))}
          {expressPlan && hits.length > 0 && (
            <li
              id={`${listId}-${hits.length}`}
              role="option"
              aria-selected={cursor === hits.length}
              className={`v3-suggestion v3-suggestion-express ${cursor === hits.length ? 'is-active' : ''}`}
              onMouseEnter={() => setCursor(hits.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(hits.length);
              }}
            >
              <span className="v3-suggestion-body">
                <span className="v3-suggestion-name">{expressPlan.label}</span>
                <span className="v3-suggestion-meta">{t('v3.esimExpress')}</span>
              </span>
              <span className="v3-suggestion-price">${expressPlan.priceUsd.toFixed(2)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
