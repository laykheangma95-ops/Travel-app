import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children: ReactNode;
}

export function Card({ hover = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card bg-white shadow-card border border-line/60',
        'transition-all duration-200 ease-smooth',
        hover && 'hover:-translate-y-0.5 hover:shadow-card-hover cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
