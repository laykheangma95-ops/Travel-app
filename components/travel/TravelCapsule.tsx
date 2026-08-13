'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Travel Capsule — the glanceable primitive of the Domner Travel OS.
//
// One capsule carries one live fact: the gate, the data left, the check-in time,
// the rain at 5pm. It is deliberately small and deliberately boring to read:
// eyebrow, headline, one line of detail, and a tap target that goes to the
// screen that fact belongs to.
//
// THREE SHAPES, ONE COMPONENT:
//   • a link      — most capsules deep-link somewhere (href)
//   • a disclosure — some expand in place (children + expandable)
//   • a readout   — weather has nowhere to go, so it is a plain div
//
// Rendering all three from here is what keeps the feel identical across the
// app. A second capsule implementation is how a design system dies.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useId, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CapsuleTone = 'urgent' | 'warning' | 'success' | 'info' | 'quiet';
export type CapsuleStatus = 'ready' | 'loading';

export interface TravelCapsuleProps {
  /** Uppercase kicker — the category. Keep to two or three words. */
  eyebrow: string;
  /** The fact. This is the line someone reads in half a second. */
  headline: string;
  /** One supporting line. Anything longer belongs in the expanded body. */
  detail?: string;
  /** Right-aligned live value in the eyebrow row: a time, a percentage, a gate. */
  meta?: string;
  icon?: LucideIcon;
  tone?: CapsuleTone;
  status?: CapsuleStatus;
  /** Deep link. Mutually exclusive with `children` — a capsule either goes somewhere or opens. */
  href?: string;
  /** Expanded body. Present means the capsule is a disclosure. */
  children?: React.ReactNode;
  /** 0–100. Renders the meter rail under the detail line. */
  meter?: number;
  /** Pulsing dot in the eyebrow. Reserve it for the one thing happening now. */
  live?: boolean;
  className?: string;
  /** Position in a deck, for the staggered reveal. */
  index?: number;
}

export function TravelCapsule({
  eyebrow,
  headline,
  detail,
  meta,
  icon: Icon,
  tone = 'quiet',
  status = 'ready',
  href,
  children,
  meter,
  live = false,
  className,
  index = 0,
}: TravelCapsuleProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const loading = status === 'loading';
  const toneClass = `capsule-${tone}`;

  const shell = cn(
    'capsule deck-item',
    toneClass,
    tone !== 'quiet' && 'capsule-rail',
    loading && 'capsule-loading',
    className
  );

  const inner = (
    <>
      <span className="capsule-eyebrow">
        {live && !loading && <span className="capsule-live-dot" aria-hidden="true" />}
        {Icon && <Icon size={13} strokeWidth={2.25} aria-hidden="true" />}
        <span className="flex-1 truncate">{eyebrow}</span>
        {meta && (
          <span className={cn('font-mono normal-case tracking-normal text-white/70', loading && 'capsule-shimmer')}>
            {meta}
          </span>
        )}
        {children && (
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn('shrink-0 transition-transform duration-300 ease-smooth', open && 'rotate-180')}
          />
        )}
      </span>

      <span className={cn('capsule-headline block', loading && 'capsule-shimmer')}>{headline}</span>

      {detail && <span className={cn('capsule-detail block', loading && 'capsule-shimmer')}>{detail}</span>}

      {typeof meter === 'number' && (
        <span className="capsule-meter mt-2.5 block" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
        </span>
      )}
    </>
  );

  const style = { '--deck-index': index } as React.CSSProperties;

  // A disclosure. The expanded body is always in the DOM so a screen reader can
  // reach it and so the height transition has something to animate; aria-hidden
  // and the collapsed grid row keep it out of the way when shut.
  if (children) {
    return (
      <div className={shell} style={style}>
        <button
          type="button"
          className="block w-full text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          {inner}
        </button>
        <div className="capsule-expandable" data-open={open}>
          <div>
            <div id={bodyId} hidden={!open} className="mt-3 border-t border-white/10 pt-3">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={shell} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={shell} style={style}>
      {inner}
    </div>
  );
}
