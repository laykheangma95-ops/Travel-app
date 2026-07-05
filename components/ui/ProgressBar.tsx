import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  tone?: 'accent' | 'success' | 'secondary';
  label?: string;
  className?: string;
}

const toneClasses = {
  accent: 'bg-accent',
  success: 'bg-success',
  secondary: 'bg-secondary',
};

export function ProgressBar({ value, tone = 'accent', label, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={className}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-smooth', toneClasses[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label && <p className="mt-2 text-xs font-medium text-ink-secondary">{label}</p>}
    </div>
  );
}
