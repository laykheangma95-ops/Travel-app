'use client';

// Domer "Wayfinder Star" mark — 8-point compass rose with a gilded gem at the
// pivot. Color recipes per surface follow the brand handoff exactly.

import { useLang } from '@/lib/i18n';

type Surface = 'navy' | 'light' | 'gold' | 'mono-dark' | 'mono-light';

const RECIPES: Record<Surface, { star: string; hub: string; gem: string }> = {
  navy: { star: '#C69749', hub: '#14263F', gem: '#E6CB8B' },
  light: { star: '#14263F', hub: '#FFFFFF', gem: '#C69749' },
  gold: { star: '#14263F', hub: '#C69749', gem: '#14263F' },
  'mono-dark': { star: '#1A1A1A', hub: '#FFFFFF', gem: '#1A1A1A' },
  'mono-light': { star: '#FFFFFF', hub: '#14263F', gem: '#FFFFFF' },
};

export const WAYFINDER_PATH = 'M50 3 L65.6 34.4 L97 50 L65.6 65.6 L50 97 L34.4 65.6 L3 50 L34.4 34.4 Z';

interface DomerMarkProps {
  surface?: Surface;
  size?: number;
  className?: string;
}

export function DomerMark({ surface = 'light', size = 28, className }: DomerMarkProps) {
  const c = RECIPES[surface];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d={WAYFINDER_PATH} fill={c.star} />
      <circle cx="50" cy="50" r="11" fill={c.hub} />
      <circle cx="50" cy="50" r="4.2" fill={c.gem} />
    </svg>
  );
}

interface DomerLogoProps {
  surface?: 'navy' | 'light';
  size?: number;
  kicker?: boolean;
  /** Seats the mark in a raised light disc — the nav's brand button. */
  badge?: boolean;
  className?: string;
}

// Full lockup: mark + wordmark, which swaps with the language switcher —
// "Domner" (Marcellus) + "TRAVEL" kicker in English, "ដំណើរ" (Khmer serif) +
// "DOMNER" kicker in Khmer — so the logo visibly responds to the language
// toggle instead of staying pinned to English.
export function DomerLogo({
  surface = 'light',
  size = 30,
  kicker = true,
  badge = false,
  className,
}: DomerLogoProps) {
  const { lang, t } = useLang();
  const wordColor = surface === 'navy' ? 'text-sandstone' : 'text-primary';
  const wordFont = lang === 'km' ? 'font-khmer' : 'font-display';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      {badge ? (
        // Seated in its own disc, the mark stops being a small graphic beside
        // some words and becomes the one round thing in a bar of rounded
        // rectangles — which is what makes it read as a button you can press.
        <span className="brand-badge" style={{ width: size, height: size }}>
          <DomerMark surface="light" size={Math.round(size * 0.58)} />
        </span>
      ) : (
        <DomerMark surface={surface} size={size} />
      )}
      <span key={lang} className="leading-none animate-fade-up">
        <span className={`block ${wordFont} text-xl tracking-[0.05em] ${wordColor}`}>{t('brand.word')}</span>
        {kicker && (
          <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.36em] text-accent">
            {t('brand.kicker')}
          </span>
        )}
      </span>
    </span>
  );
}
