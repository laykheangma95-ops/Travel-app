import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

const toneClasses: Record<Tone, string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
  accent: 'bg-accent/15 text-gold-light border-accent/30',
  neutral: 'bg-surface-3 text-ink-secondary border-line',
};

interface BadgeProps {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', pulse = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        toneClasses[tone],
        pulse && 'animate-pulse-soft',
        className
      )}
    >
      {children}
    </span>
  );
}
