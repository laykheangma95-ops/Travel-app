'use client';

// ═══════════════════════════════════════════════════════════════════════════
// THE TIMESTAMP BURN — docs/corner-map-spec.md §3, signature element.
//
// A date stamp burned into the lower-right of every shot, 90s point-and-shoot
// style: mono, letter-spaced 0.08em, Latin numerals always. Marigold when
// live, dimming as it ages.
//
// This is simultaneously the film-photo aesthetic, the brand mark, and the
// literal product mechanic. It is the one place to spend boldness — everything
// else in the module stays quiet.
//
//   ┌──────────────────────┐
//   │      [ photo ]       │
//   │         '26 7 27 19:42│  ← mono, tracking 0.08em, --live
//   └──────────────────────┘
//
// `--live` is a STATE colour. If marigold renders here on anything 60 minutes
// old or older, that is a bug — the tier table in freshness.ts is the only
// thing allowed to decide.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { freshnessOf, TIER, type Freshness } from '@/lib/corner-map/freshness';
import { minutesSince, stampDateOnly, stampOf } from '@/lib/corner-map/format';
import { useLang } from '@/lib/i18n';

interface StampProps {
  capturedAt: Date | string;
  /**
   * True once the shot's image has decoded. The stamp burns in 220ms after
   * that, once — it never re-runs on re-render. Standalone stamps (a corner
   * header, say) can leave this at its default and reveal immediately.
   */
  imageReady?: boolean;
  /** Bigger stamp for the full-bleed shot in the corner sheet. */
  size?: 'sm' | 'md';
  className?: string;
}

/** How often the label re-renders. LIVE counts minutes; nothing else moves. */
const LIVE_TICK_MS = 30_000;

export function Stamp({ capturedAt, imageReady = true, size = 'sm', className = '' }: StampProps) {
  const { t } = useLang();
  const at = typeof capturedAt === 'string' ? new Date(capturedAt) : capturedAt;

  // Freshness is relative to *now*, which the server does not share with the
  // client. Rendering null until mount keeps hydration honest rather than
  // flashing a server-computed tier that may already be wrong.
  const [now, setNow] = useState<Date | null>(null);
  const [burned, setBurned] = useState(false);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const tier: Freshness | null = now ? freshnessOf(at, now) : null;

  // Only a LIVE stamp ticks, and only while it is still live.
  useEffect(() => {
    if (tier !== 'LIVE') return;
    const id = setInterval(() => setNow(new Date()), LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [tier]);

  // The 220ms reveal, fired once the image has decoded.
  useEffect(() => {
    if (!imageReady || burned || !now) return;
    const id = setTimeout(() => setBurned(true), 0);
    return () => clearTimeout(id);
  }, [imageReady, burned, now]);

  if (!tier || !now) return null;

  const treatment = TIER[tier];
  const mins = minutesSince(at, now);

  // ARCHIVE shows the date only — no time of day. A shot from three weeks ago
  // claiming 19:42 is precision the viewer has no use for.
  const stamp = tier === 'ARCHIVE' ? stampDateOnly(at) : stampOf(at);

  return (
    <div
      className={`corner-stamp pointer-events-none flex flex-col items-end gap-0.5 ${
        burned ? 'animate-stamp-burn' : 'opacity-0'
      } ${className}`}
    >
      {/* Live shots carry a count-up above the stamp. Nothing else does. */}
      {tier === 'LIVE' && (
        <span
          className={`flex items-center gap-1 leading-none text-live ${
            size === 'md' ? 'text-[11px]' : 'text-[9px]'
          }`}
        >
          <span aria-hidden="true" className="text-[7px]">
            ●
          </span>
          {mins < 1 ? t('corner.justNow') : t('corner.minAgo', { n: mins })}
        </span>
      )}

      <time
        dateTime={at.toISOString()}
        // Latin numerals always (§8) — force the Latin numbering system even
        // when the surrounding UI is Khmer.
        lang="en"
        className={`leading-none ${treatment.textClass} ${
          size === 'md' ? 'text-[13px]' : 'text-[10px]'
        } ${tier === 'ARCHIVE' ? 'opacity-70' : ''}`}
      >
        {stamp}
      </time>
    </div>
  );
}
