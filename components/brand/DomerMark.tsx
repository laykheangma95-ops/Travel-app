// Domer "Wayfinder Star" mark — 8-point compass rose with a gilded gem at the
// pivot. Color recipes per surface follow the brand handoff exactly.

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
  className?: string;
}

// Full lockup: mark + "Domer" wordmark (Marcellus, tracking .05em) with the
// optional "TRAVEL" kicker (caps, tracking .36em, Angkor Gold).
export function DomerLogo({ surface = 'light', size = 30, kicker = true, className }: DomerLogoProps) {
  const wordColor = surface === 'navy' ? 'text-sandstone' : 'text-primary';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <DomerMark surface={surface} size={size} />
      <span className="leading-none">
        <span className={`block font-display text-xl tracking-[0.05em] ${wordColor}`}>Domer</span>
        {kicker && (
          <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.36em] text-accent">
            Travel
          </span>
        )}
      </span>
    </span>
  );
}
