import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Night-surface variant for use inside .night-canvas sections. */
  dark?: boolean;
}

export function EmptyState({ icon: Icon, title, description, ctaLabel, ctaHref, dark = false }: EmptyStateProps) {
  return (
    <div
      className={
        dark
          ? 'night-card flex flex-col items-center justify-center border-dashed px-6 py-16 text-center'
          : 'flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface-2 px-6 py-16 text-center'
      }
    >
      <div className={dark ? 'night-icon mb-4 h-14 w-14' : 'mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-bright/40'}>
        <Icon size={26} className={dark ? 'text-gold-light' : 'text-accent'} aria-hidden="true" />
      </div>
      <h3 className={`font-display text-lg font-bold ${dark ? 'text-white' : 'text-ink'}`}>{title}</h3>
      <p className={`mt-1.5 max-w-sm text-sm ${dark ? 'text-white/65' : 'text-ink-secondary'}`}>{description}</p>
      {ctaLabel && ctaHref && (
        <Button href={ctaHref} variant={dark ? 'liquid-accent' : 'primary'} className="mt-6">
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}
