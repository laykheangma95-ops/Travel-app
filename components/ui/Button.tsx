import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'outline-light'
  | 'ghost'
  | 'danger'
  | 'liquid'
  | 'liquid-accent';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary:
    'liquid-glass-accent liquid-sheen text-white hover:brightness-110 focus-visible:ring-accent',
  secondary:
    'bg-secondary text-white hover:bg-[#162c4a] focus-visible:ring-secondary shadow-sm',
  outline:
    'border border-line bg-white text-ink hover:border-secondary hover:text-secondary focus-visible:ring-secondary',
  'outline-light':
    'liquid-glass liquid-sheen text-white hover:brightness-110 focus-visible:ring-white',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface-3 focus-visible:ring-secondary',
  danger: 'bg-danger text-white hover:bg-red-600 focus-visible:ring-danger',
  liquid: 'liquid-glass liquid-sheen text-white hover:brightness-110 focus-visible:ring-white',
  'liquid-accent':
    'liquid-glass-accent liquid-sheen text-white hover:brightness-110 focus-visible:ring-accent',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  href?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  href,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition-all duration-200 ease-smooth',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
    variantClasses[variant],
    sizeClasses[size],
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
