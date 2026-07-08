import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

const toneClasses: Record<Tone, string> = {
  success: 'bg-emerald-50 text-success border-emerald-200',
  warning: 'bg-amber-50 text-warning border-amber-200',
  danger: 'bg-red-50 text-danger border-red-200',
  info: 'bg-blue-50 text-blue-600 border-blue-200',
  accent: 'bg-[#F5EEDC] text-accent border-[#E2CFA0]',
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
