'use client';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationStack — several updates about one thing, as one object.
//
// THE PROBLEM IT SOLVES:
//   A delayed flight does not send one notification. It sends "delayed 20
//   minutes", then "delayed 40 minutes", then "gate changed", then "boarding".
//   Rendered flat, one bad afternoon buries every other part of the trip under
//   five near-identical cards, and the traveler starts scrolling past all of
//   them — including the one that mattered.
//
//   So updates about the same entity collapse into a deck: the newest card is
//   on top, the rest are implied by two offset layers and a count. Tap to fan
//   them out, tap again to gather them back.
//
// The fan is a staggered spring, not a height transition, because the cards
// should read as physical things being dealt out — that is what makes the
// collapsed state legible as "there are more of these underneath" rather than
// as a styling flourish.
//
// A stack of one renders as a plain row. No deck, no count, no disclosure — an
// affordance that does nothing is worse than no affordance.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { NotificationCard, type InboxNotification } from './NotificationCard';
import { SwipeableRow } from './SwipeableRow';
import { useLang } from '@/lib/i18n';

export function NotificationStack({
  items,
  onRead,
  onClear,
  index = 0,
}: {
  /** Same entity, already sorted newest first by the caller. */
  items: InboxNotification[];
  onRead: (id: string) => void;
  onClear: (id: string) => void;
  index?: number;
}) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const [top, ...rest] = items;
  if (!top) return null;

  const row = (item: InboxNotification, position: number) => (
    <SwipeableRow
      key={item.id}
      canRead={item.read_at === null}
      onRead={() => onRead(item.id)}
      onClear={() => onClear(item.id)}
    >
      <NotificationCard
        notification={item}
        onRead={onRead}
        onClear={onClear}
        index={position}
      />
    </SwipeableRow>
  );

  // One update about one thing is just a row.
  if (rest.length === 0) return row(top, index);

  const unread = items.filter((item) => item.read_at === null).length;
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 32 };

  return (
    <div className="relative">
      {/* The two layers behind. Inert, textless, aria-hidden — they exist to
          say "there is more here", and a screen reader is told that in words
          by the button below instead. */}
      <AnimatePresence initial={false}>
        {!open && (
          <>
            <m.span
              key="layer-1"
              className="stack-shadow"
              initial={{ opacity: 0, y: 0, scale: 1 }}
              animate={{ opacity: 1, y: 7, scale: 0.972 }}
              exit={{ opacity: 0, y: 0, scale: 1 }}
              transition={spring}
              aria-hidden="true"
            />
            {rest.length > 1 && (
              <m.span
                key="layer-2"
                className="stack-shadow"
                initial={{ opacity: 0, y: 0, scale: 1 }}
                animate={{ opacity: 0.7, y: 14, scale: 0.944 }}
                exit={{ opacity: 0, y: 0, scale: 1 }}
                transition={{ ...spring, delay: reduceMotion ? 0 : 0.03 }}
                aria-hidden="true"
              />
            )}
          </>
        )}
      </AnimatePresence>

      <div className="relative">{row(top, index)}</div>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="fanned"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="mt-2.5 space-y-2.5"
          >
            {rest.map((item, position) => (
              <m.div
                key={item.id}
                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.96 }}
                // Dealt out one at a time. Capped by the slice below so a long
                // thread never becomes a slow reveal.
                transition={{ ...spring, delay: reduceMotion ? 0 : position * 0.045 }}
              >
                {row(item, position)}
              </m.div>
            ))}
          </m.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-3 flex min-h-[2.25rem] items-center gap-2 pl-1 text-xs font-semibold uppercase tracking-widest text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
      >
        <Layers size={13} aria-hidden="true" />
        {open
          ? lang === 'km'
            ? 'បង្រួម'
            : 'Collapse'
          : lang === 'km'
            ? `មើល ${rest.length} ទៀត`
            : `${rest.length} more update${rest.length === 1 ? '' : 's'}`}
        {!open && unread > 0 && (
          <span className="stack-count">
            {unread}
            <span className="sr-only"> {lang === 'km' ? 'មិនទាន់អាន' : 'unread'}</span>
          </span>
        )}
      </button>
    </div>
  );
}
