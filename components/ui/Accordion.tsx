'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionItemProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionItem({ title, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-ink transition-colors hover:text-secondary"
      >
        {title}
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-ink-muted transition-transform duration-200 ease-smooth', open && 'rotate-180')}
        />
      </button>
      {open && <div className="pb-4 text-sm leading-relaxed text-ink-secondary animate-fade-up">{children}</div>}
    </div>
  );
}

export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-card border border-line bg-white px-5', className)}>{children}</div>;
}
