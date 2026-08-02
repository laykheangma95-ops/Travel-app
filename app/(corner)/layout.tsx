// ═══════════════════════════════════════════════════════════════════════════
// CORNER MAP (ជ្រុង) — module shell. docs/corner-map-spec.md §3.
//
// Map-first, sheet-over: no tab bar and no site chrome competing with the map,
// so this shell covers the viewport above the marketing Navbar/Footer that the
// root layout renders.
//
// The Corner type stack loads here rather than in the root layout so the rest
// of Domner stays on its three faces and doesn't pay for four more.
// ═══════════════════════════════════════════════════════════════════════════

import type { Metadata } from 'next';
import { Bricolage_Grotesque, Kantumruy_Pro } from 'next/font/google';
import localFont from 'next/font/local';
import 'maplibre-gl/dist/maplibre-gl.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-corner-display',
});

// Khmer body + display. Variable weight, so no `weight` key.
const khmer = Kantumruy_Pro({
  subsets: ['khmer', 'latin'],
  variable: '--font-corner-khmer',
});

// Geist postdates Next 14.2's Google Font manifest — vendored, see
// public/fonts/corner/LICENSE.md.
const body = localFont({
  src: '../../public/fonts/corner/geist-latin.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-corner-body',
});

const mono = localFont({
  src: '../../public/fonts/corner/geist-mono-latin.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-corner-mono',
});

export const metadata: Metadata = {
  title: 'Corner · ជ្រុង',
  description:
    'See what a place in Cambodia looks like right now — and keep the corners you have been.',
};

export default function CornerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      // z-[100] clears the site chrome the root layout renders around this —
      // in particular the Trip Copilot FAB at z-[90], which would otherwise
      // float over the sheet and the capture button.
      className={`corner-root fixed inset-0 z-[100] flex flex-col overflow-hidden bg-dusk text-paper ${display.variable} ${body.variable} ${mono.variable} ${khmer.variable}`}
    >
      {/* No tab bar (§3). Each screen floats its own chrome over the map.
          `min-h-0` matters: without it a flex child refuses to shrink and the
          percentage heights inside it resolve to 0, which silently leaves
          MapLibre on its 300px default canvas. */}
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
