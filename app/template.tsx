// Site-wide page transition. A `template` (unlike `layout`) re-mounts on every
// navigation, so wrapping page content here replays the entrance animation on
// each route change — a smooth crossfade between pages. Navbar and Footer live
// in the layout, so they stay put while only the page content transitions.
//
// The animation is pure CSS (.page-transition in globals.css): it plays before
// React hydration, needs no library, and the global prefers-reduced-motion rule
// makes it instant. It animates opacity ONLY — a transform/filter here would
// create a containing block and break `position: fixed` elements (maps, modals,
// the globe) on every page.

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
