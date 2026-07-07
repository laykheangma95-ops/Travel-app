import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  dark?: boolean;
}

export function SectionHeading({ eyebrow, title, description, align = 'center', dark = false }: SectionHeadingProps) {
  return (
    <div className={cn('mb-12 max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && (
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">{eyebrow}</p>
      )}
      <h2 className={cn('font-display text-3xl font-bold tracking-tight sm:text-4xl', dark ? 'text-white' : 'text-ink')}>
        {title}
      </h2>
      {description && (
        <p className={cn('mt-4 text-base leading-relaxed', dark ? 'text-white/70' : 'text-ink-secondary')}>
          {description}
        </p>
      )}
    </div>
  );
}
