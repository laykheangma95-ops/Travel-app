'use client';

// StatusBadge — the night-surface counterpart to components/ui/Badge.
//
// Badge already exists and is right for light utility screens (admin, orders).
// It paints solid light pills, which disappear on the night canvas, so this is
// the dark-surface variant rather than a replacement: same idea, glass instead
// of paper. One of them is always the correct choice, and which one depends on
// the surface, not the data.

import { cn } from '@/lib/utils';

export type StatusTone = 'urgent' | 'warning' | 'success' | 'info' | 'quiet';

const TONE: Record<StatusTone, string> = {
  // Gold is the urgent tone here rather than red: red on Temple Night reads as
  // an error dialog, and most "urgent" travel states are time-critical, not
  // broken. Cancellations carry their own words.
  urgent: 'border-gold-light/50 bg-accent/20 text-gold-bright',
  warning: 'border-warning/40 bg-warning/15 text-[#FCD34D]',
  success: 'border-success/40 bg-success/15 text-[#6EE7B7]',
  info: 'border-[#57C8FF]/40 bg-[#57C8FF]/12 text-[#8FD8FF]',
  quiet: 'border-white/15 bg-white/5 text-white/65',
};

export function StatusBadge({
  children,
  tone = 'quiet',
  className,
  dot = false,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
  /** A small leading dot. Use it for live states, not for every badge. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        TONE[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
