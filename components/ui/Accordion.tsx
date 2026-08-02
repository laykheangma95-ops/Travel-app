'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Items inherit the night/light variant from their parent Accordion.
const AccordionDarkContext = createContext(false);

interface AccordionItemProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionItem({ title, defaultOpen = false, children }: AccordionItemProps) {
  const dark = useContext(AccordionDarkContext);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('border-b last:border-b-0', dark ? 'border-white/10' : 'border-line')}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold transition-colors',
          dark ? 'text-white hover:text-gold-light' : 'text-ink hover:text-secondary'
        )}
      >
        {title}
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 transition-transform duration-200 ease-smooth',
            dark ? 'text-gold-light/70' : 'text-ink-muted',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className={cn('pb-4 text-sm leading-relaxed animate-fade-up', dark ? 'text-white/70' : 'text-ink-secondary')}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Accordion({ children, className, dark = false }: { children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <AccordionDarkContext.Provider value={dark}>
      <div className={cn('rounded-card border px-5', dark ? 'night-card' : 'border-line bg-white', className)}>{children}</div>
    </AccordionDarkContext.Provider>
  );
}
