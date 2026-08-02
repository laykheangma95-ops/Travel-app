'use client';

// Route transition (see .claude/skills/ui-ux §9.2). A template re-mounts on
// every navigation, so this soft crossfade replays as one continuous night
// surface instead of a hard cut between pages.
//
// Opacity only — deliberately NO transform. A transformed ancestor would become
// the containing block for the `sticky` order summaries in cart/checkout and
// break them. The fade reads premium without that risk. Fully skipped under
// prefers-reduced-motion, and it never touches focus or the back button.

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
