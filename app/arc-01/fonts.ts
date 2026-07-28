import { Archivo, Bodoni_Moda, IBM_Plex_Mono } from 'next/font/google';

// ARC-01 runs its own three-family type system, scoped to this route via CSS
// variables on the page wrapper so it never touches the rest of the app.
//
//   Bodoni Moda   — didone display. Oversized headlines, the hero mark.
//   Archivo       — grotesque. Running text and product copy.
//   IBM Plex Mono — every number, label and tolerance on the site.

export const arcDisplay = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
  variable: '--arc-display',
  display: 'swap',
});

export const arcSans = Archivo({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--arc-sans',
  display: 'swap',
});

export const arcMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--arc-mono',
  display: 'swap',
});
