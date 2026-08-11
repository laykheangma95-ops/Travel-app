// Route transition (see .claude/skills/ui-ux §9.2). A template re-mounts on
// every navigation, so this soft crossfade replays as one continuous night
// surface instead of a hard cut between pages.
//
// Opacity only — deliberately NO transform. A transformed ancestor would become
// the containing block for the `sticky` order summaries in cart/checkout and
// break them. The fade reads premium without that risk, and it never touches
// focus or the back button.
//
// This previously branched on framer-motion's `useReducedMotion()` and returned
// a *structurally different tree* — `<>{children}</>` versus `<motion.div>` —
// depending on the answer. The server always evaluates that hook as "no
// preference", so every visitor who asks for reduced motion hit a hydration
// mismatch and a full client re-render on every single route. That is the one
// group least able to absorb a janky re-render, and it was silent in
// production because minified React errors say nothing useful.
//
// Pure CSS now: identical DOM either way, and `prefers-reduced-motion` is
// honoured by the global rule in globals.css, which neutralises the animation
// without JavaScript needing to know the answer at all. It also takes
// framer-motion off the critical path for every page on the site.

import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-fade">{children}</div>;
}
