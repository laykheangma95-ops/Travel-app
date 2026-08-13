'use client';

// ─────────────────────────────────────────────────────────────────────────────
// AIInsight — the travel companion, speaking one sentence at the right moment.
//
// §17 of the brief: AI should appear contextually, not as a chatbot bolted to
// the corner of every screen. Domner already has a chat surface (TripCopilot),
// so this component is deliberately NOT another one. It is a single observation
// with at most one action, generated from the traveler's actual state —
// "your eSIM isn't ready yet", "you land at 22:40, book transport first".
//
// The wording is composed in lib/travel/insights.ts from real data. There is no
// model call here: an insight that needs a round trip to an LLM cannot be shown
// during the first paint of Home, and one that hallucinates a gate number is
// worse than silence. The Copilot remains the place for open questions.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AIInsightProps {
  /** The observation. One sentence, first person plural, no hedging. */
  message: string;
  /** At most one action. Two actions is a menu, and a menu is not an insight. */
  action?: { label: string; href: string };
  className?: string;
  /** Renders quieter, for use inside a card rather than as its own band. */
  inline?: boolean;
}

export function AIInsight({ message, action, className, inline = false }: AIInsightProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3',
        inline
          ? 'rounded-btn border border-white/10 bg-white/[0.04] p-3'
          : 'night-card p-4 sm:p-5',
        className
      )}
    >
      {/* The mark, not a purple robot avatar. Domner's own visual identity
          (§21: avoid generic AI styling). */}
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-light/30 bg-accent/15 text-gold-light"
        aria-hidden="true"
      >
        <Sparkles size={14} strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-white/85">{message}</p>
        {action && (
          <Link
            href={action.href}
            className="mt-2.5 inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-btn border border-gold-light/40 px-3 py-1.5 text-xs font-semibold text-gold-bright transition-colors duration-200 ease-smooth hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            {action.label}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
