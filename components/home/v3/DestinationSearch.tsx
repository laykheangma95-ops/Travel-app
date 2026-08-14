'use client';

// The search field is the only control on the first screen, so it carries every
// job a second control would otherwise take:
//
//  • it searches, obviously
//  • its suggestions say *why* they rank — "1h 5m direct from Phnom Penh ·
//    visa-free" — so the list answers the question before you finish asking it
//  • for a returning visitor it becomes the express lane: the last row is their
//    eSIM, two taps from keystroke to checkout with no chapter scrolled
//  • it degrades honestly: somewhere we have not written up says so, and offers
//    the eSIM if we sell one
//
// Fully keyboard operable: ↑ ↓ to move, Enter to commit, Escape to clear,
// "/" from anywhere on the page to focus. Implements the combobox pattern with
// aria-activedescendant so a screen reader hears the highlighted option.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { play } from '@/lib/sound';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { searchDestinations, type SearchHit } from '@/content/destinations';
import { useBi, useLang } from '@/lib/i18n';
import type { DestinationGuide } from '@/content/schema';

export interface SearchSelection {
  guide?: DestinationGuide;
  esimSlug?: string;
  esimName?: string;
}

function flightLabel(mins: number | null, t: (k: 'v3.direct' | 'v3.oneStop') => string): string {
  if (mins == null) return t('v3.oneStop');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h}h ` : ''}${m ? `${m}m ` : ''}${t('v3.direct')}`;
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

  const hits = useMemo(() => searchDestinations(query), [query]);
  const rowCount = hits.length + (expressPlan && hits.length ? 1 : 0);

  useEffect(() => setCursor(0), [query]);

  // Light whatever is currently under the cursor, and put it out when the list
  // closes. Guides only — we cannot light a city we have not written up.
  useEffect(() => {
    if (!onPreview) return;
    const hit = open && query.trim() ? hits[cursor] : undefined;
    onPreview(hit && hit.kind === 'guide' ? hit.guide.slug : null);
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
    if (hit.kind === 'guide') onSelect({ guide: hit.guide });
    else if (hit.viaCity) {
      // Name the place they typed, not the country we resolved it to. Someone
      // who searched Paris should not be greeted by a page headed "France".
      onSelect({
        esimSlug: hit.slug,
        esimName: bi({ en: hit.viaCity.name, km: hit.viaCity.nameKm ?? hit.viaCity.name }),
      });
    } else onSelect({ esimSlug: hit.slug, esimName: hit.name });
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
          {hits.map((hit: SearchHit, i) => (
            <li
              key={hit.kind === 'guide' ? hit.guide.slug : `esim-${hit.slug}`}
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
                  {hit.kind === 'guide'
                    ? bi(hit.guide.city)
                    : hit.viaCity
                      ? bi({ en: hit.viaCity.name, km: hit.viaCity.nameKm ?? hit.viaCity.name })
                      : hit.name}
                  {hit.kind === 'guide' && (
                    <span className="v3-suggestion-country">{bi(hit.guide.country)}</span>
                  )}
                  {hit.kind === 'esim-only' && hit.viaCity && (
                    <span className="v3-suggestion-country">
                      {bi({ en: hit.name, km: hit.nameKm })}
                    </span>
                  )}
                </span>
                <span className="v3-suggestion-meta">
                  {hit.kind === 'esim-only' && hit.viaCity ? (
                    // The country is already on the line above as the chip, so
                    // this says what we can do about it rather than repeating it.
                    t('v3.cityCovered')
                  ) : hit.kind === 'guide' ? (
                    <>
                      {flightLabel(hit.guide.directFlightMins, t)}
                      <span className="v3-dot-sep" aria-hidden="true" />
                      {hit.guide.entry.visa.kind === 'visa-free'
                        ? bi({ en: 'visa-free', km: 'ឥតទិដ្ឋាការ' })
                        : hit.guide.entry.visa.kind === 'check-before-booking'
                          ? bi({ en: 'check entry rules', km: 'ពិនិត្យលក្ខខណ្ឌចូល' })
                          : bi({ en: 'visa required', km: 'ត្រូវការទិដ្ឋាការ' })}
                    </>
                  ) : (
                    t('v3.guideSoon')
                  )}
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
