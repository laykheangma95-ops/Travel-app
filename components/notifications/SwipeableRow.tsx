'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SwipeableRow — a thumb gesture that explains itself.
//
// Drag right to mark read, left to clear. The intent track behind is revealed
// by the row moving off it, and its colour and label arrive *before* the
// threshold is crossed — so the gesture teaches itself on the first attempt
// instead of firing a surprise.
//
// THREE THINGS THAT MAKE THIS SAFE RATHER THAN CLEVER:
//
//   1. Nothing happens below the threshold. The row springs home, and the cost
//      of an accidental drag is zero.
//   2. Swipe is never the only way. Every action here also exists as a real
//      button in the row itself, so a keyboard, a screen reader, a trackpad or
//      a shaky hand all have a first-class path. A gesture-only affordance is
//      an inaccessible one.
//   3. Reduced motion disables dragging entirely rather than animating it
//      faster: for a vestibular-sensitive user, a surface that slides under
//      their finger is the problem, not its speed.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { m, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useLang } from '@/lib/i18n';

/** How far the row must travel before letting go commits the action. */
const THRESHOLD = 96;

export function SwipeableRow({
  children,
  onRead,
  onClear,
  /** Read rows have nothing to mark, so the right-hand gesture is disabled. */
  canRead = true,
}: {
  children: React.ReactNode;
  onRead: () => void;
  onClear: () => void;
  canRead?: boolean;
}) {
  const { lang } = useLang();
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const [committing, setCommitting] = useState<'read' | 'clear' | null>(null);

  // Both intents fade in over the first two thirds of the threshold, so the
  // label is fully legible by the time the gesture is worth committing.
  const readOpacity = useTransform(x, [0, THRESHOLD * 0.65], [0, 1]);
  const clearOpacity = useTransform(x, [0, -THRESHOLD * 0.65], [0, 1]);

  // NOTE: reduced motion turns dragging OFF via a prop — it must never return a
  // structurally different tree. The server always evaluates useReducedMotion()
  // as "no preference", so branching on it in the markup hands every
  // reduced-motion visitor a hydration mismatch and a full client re-render.
  // app/template.tsx carries the long version of this lesson; it was found in
  // production and it was silent. Same DOM either way, always.
  const dragEnabled = !reduceMotion;

  return (
    <div className="relative">
      {/* The track. Decorative: every label here names an action that also has
          a button inside the row. */}
      <div className="swipe-track bg-white/[0.04]" aria-hidden="true">
        <m.span className="swipe-intent swipe-intent-read" style={{ opacity: readOpacity }}>
          <Check size={14} strokeWidth={2.5} />
          {canRead ? (lang === 'km' ? 'បានអាន' : 'Read') : ''}
        </m.span>
        <m.span className="swipe-intent swipe-intent-clear" style={{ opacity: clearOpacity }}>
          {lang === 'km' ? 'លុប' : 'Clear'}
          <X size={14} strokeWidth={2.5} />
        </m.span>
      </div>

      <m.div
        drag={dragEnabled ? 'x' : false}
        style={{ x }}
        // Rubber-band past the threshold rather than a hard stop: resistance is
        // how a surface says "that is as far as this goes".
        dragConstraints={{ left: -THRESHOLD * 1.4, right: canRead ? THRESHOLD * 1.4 : 0 }}
        dragElastic={0.12}
        dragDirectionLock
        onDragEnd={(_event, info) => {
          // Velocity counts as well as distance, so a quick flick works without
          // having to drag the full distance.
          const travelled = info.offset.x + info.velocity.x * 0.08;
          if (canRead && travelled > THRESHOLD) {
            setCommitting('read');
            onRead();
          } else if (travelled < -THRESHOLD) {
            setCommitting('clear');
            onClear();
          }
        }}
        animate={committing === null ? { x: 0 } : undefined}
        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        className="relative touch-pan-y"
      >
        {children}
      </m.div>
    </div>
  );
}
