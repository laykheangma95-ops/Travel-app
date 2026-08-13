'use client';

// ─────────────────────────────────────────────────────────────────────────────
// DotMeter — a quantity you read without reading.
//
// A progress bar tells you a proportion. A grid of dots tells you *how much is
// left* — you count the dark ones without meaning to. For the two numbers that
// actually worry a traveler (data remaining, days remaining) that is the
// difference between a statistic and a feeling.
//
// It is `aria-hidden` and paired with a real text value by its caller: a screen
// reader should hear "1.4 GB remaining", not twenty-eight dots.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils';

export function DotMeter({
  /** 0–100. */
  percent,
  /** Total dots. 28 reads as "a month" for days; 20 is plenty for a data bar. */
  total = 20,
  rows = 1,
  /** Animate the fill in on mount. Off inside a list that is already staggering. */
  animate = true,
  className,
}: {
  percent: number;
  total?: number;
  rows?: number;
  animate?: boolean;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  // Round up so a non-zero value never renders as an entirely empty meter —
  // "a sliver left" and "nothing left" are different messages.
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * total));

  return (
    <span
      className={cn('dot-meter', animate && 'dot-animate', className)}
      style={{ '--dot-rows': rows } as React.CSSProperties}
      aria-hidden="true"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn('dot', index < filled && 'dot-on')}
          style={{ '--dot-index': index } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
