'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { countries, countriesByCode, flagEmoji, PRIORITY_COUNTRY_CODES } from '@/data/countries';
import { cn } from '@/lib/utils';

interface CountryPickerProps {
  value: string;
  onChange: (code: string) => void;
  /** Show the +dial code next to each country (phone mode) or not (passport mode). */
  showDial?: boolean;
  /** Compact trigger for use inside a phone field. */
  compact?: boolean;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function CountryPicker({
  value,
  onChange,
  showDial = false,
  compact = false,
  id,
  disabled,
  'aria-label': ariaLabel,
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = countriesByCode[value];

  // Priority markets first, then everything else alphabetically.
  const ordered = useMemo(() => {
    const priority = PRIORITY_COUNTRY_CODES.map((c) => countriesByCode[c]).filter(Boolean);
    const rest = countries.filter((c) => !PRIORITY_COUNTRY_CODES.includes(c.code));
    return [...priority, ...rest];
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    const bare = q.replace(/^\+/, '');
    return ordered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase() === q ||
        (bare.length > 0 && /^\d+$/.test(bare) && c.dial.startsWith(bare))
    );
  }, [ordered, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    searchRef.current?.focus();
    const onClickAway = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? 'Select country'}
        className={cn(
          'flex items-center gap-2 rounded-btn border border-line bg-white text-sm text-ink transition-all duration-200 ease-smooth focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:bg-surface-3',
          compact ? 'h-[42px] shrink-0 px-3' : 'w-full px-4 py-2.5'
        )}
      >
        <span className="text-base leading-none">{selected ? flagEmoji(selected.code) : '🏳️'}</span>
        {compact ? (
          <span className="font-medium tabular-nums">+{selected?.dial ?? ''}</span>
        ) : (
          <span className="flex-1 truncate text-left">
            {selected?.name ?? 'Select a country'}
            {showDial && selected && (
              <span className="ml-1.5 text-ink-muted">+{selected.dial}</span>
            )}
          </span>
        )}
        <ChevronDown size={15} className="text-ink-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 overflow-hidden rounded-card border border-line bg-white shadow-card',
            compact ? 'w-[19rem]' : 'w-full'
          )}
        >
          <div className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
            <Search size={15} className="text-ink-muted" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
              aria-label="Search countries"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-muted">No country matches “{query}”.</li>
            )}
            {results.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.code === value}
                  onClick={() => pick(c.code)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2',
                    c.code === value && 'bg-surface-2 font-semibold'
                  )}
                >
                  <span className="text-base leading-none">{flagEmoji(c.code)}</span>
                  <span className="flex-1 truncate text-ink">{c.name}</span>
                  {showDial && <span className="tabular-nums text-ink-muted">+{c.dial}</span>}
                  {c.code === value && <Check size={15} className="text-secondary" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
