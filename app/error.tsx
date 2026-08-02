'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Compass, RotateCw } from 'lucide-react';

/**
 * Route-level error boundary. Without this file any thrown render error fell
 * through to Next's unstyled default page — an unbranded grey screen at the
 * exact moment a traveller most needs to trust us.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // lib/logger is a server module (reads process.env at import time), so the
    // boundary logs directly — see CLAUDE.md on client/server module boundaries.
    console.error(
      JSON.stringify({ level: 'error', event: 'route_error', message: error.message, digest: error.digest })
    );
  }, [error]);

  return (
    <div className="night-canvas flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-md text-center">
        <div className="night-icon mx-auto mb-6 flex h-16 w-16">
          <Compass size={30} className="text-gold-light" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          Something went wrong
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white">
          We lost the signal for a moment
        </h1>
        <p className="mt-4 text-white/70">
          This one is on us, not on you. Nothing you bought is affected — your orders and eSIMs are
          safe. Try again, and if it keeps happening our Khmer support team is one message away.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="liquid-glass-accent liquid-sheen liquid-touch liquid-press inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-btn px-6 py-3 text-sm font-semibold text-primary-deep transition-all duration-200 ease-smooth hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
          >
            <RotateCw size={16} aria-hidden="true" /> Try again
          </button>
          <Link
            href="/"
            className="liquid-glass liquid-sheen liquid-touch inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-btn px-6 py-3 text-sm font-semibold text-white transition-all duration-200 ease-smooth hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
          >
            Back to home
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-xs text-white/40">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
