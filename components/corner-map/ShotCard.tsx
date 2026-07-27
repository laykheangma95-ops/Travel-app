'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SHOT CARD — docs/corner-map-spec.md §2 (freshness treatment) + §3 (stamp).
//
// Photos visibly age. The image itself desaturates on the §2 curve, archive
// shots take grain, and the stamp dims with them. A corner with nothing fresh
// looks *cold* — which is the honest answer to "is this place alive right now".
//
// The treatment is never chosen here; it comes from TIER in freshness.ts so
// the §2 table can only be wrong in one place.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { freshnessOf, TIER } from '@/lib/corner-map/freshness';
import { shotUrl } from '@/lib/corner-map/format';
import type { Shot } from '@/lib/corner-map/types';
import { useLang } from '@/lib/i18n';
import { BlurhashCanvas } from './BlurhashCanvas';
import { Stamp } from './Stamp';

interface ShotCardProps {
  shot: Shot;
  /** Rail thumbnails are square; the sheet's lead shot is 4:5. */
  aspect?: 'square' | 'portrait';
  className?: string;
  /** One tap to report — the reason picker is the only confirmation (§5.2). */
  onReport?: (shot: Shot) => void;
  onClick?: (shot: Shot) => void;
  priority?: boolean;
}

export function ShotCard({
  shot,
  aspect = 'square',
  className = '',
  onReport,
  onClick,
  priority = false,
}: ShotCardProps) {
  const { t, lang } = useLang();
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  // Freshness is time-relative, so it is computed after mount only — see Stamp.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const capturedAt = new Date(shot.captured_at);
  const tier = now ? freshnessOf(capturedAt, now) : null;
  const treatment = tier ? TIER[tier] : null;

  // A cached image can be complete before React attaches onLoad, which would
  // strand the stamp at opacity 0 forever.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setReady(true);
  }, []);

  return (
    // Always a div: the card can carry both an open action and a report
    // action, and a button inside a button is invalid and unreachable by
    // keyboard. Each action gets its own control below instead.
    <div
      className={`group relative block overflow-hidden rounded-lg bg-slab ${
        aspect === 'square' ? 'aspect-square' : 'aspect-[4/5]'
      } ${treatment?.grain ? 'corner-grain' : ''} ${className}`}
    >
      {shot.blurhash && !ready && (
        <div className="absolute inset-0">
          <BlurhashCanvas hash={shot.blurhash} />
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- decode() timing
          drives the stamp reveal, which next/image does not expose. */}
      <img
        ref={imgRef}
        src={shotUrl(shot.storage_path)}
        alt={shot.caption ?? ''}
        width={shot.width ?? undefined}
        height={shot.height ?? undefined}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setReady(true)}
        // A shot that fails to load must not leave a dead grey box with a live
        // stamp burning on it.
        onError={() => setReady(false)}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{
          // §2: LIVE and TODAY are untouched; WEEK sits at 85% saturation;
          // ARCHIVE desaturates hard and takes the grain overlay above.
          filter: treatment?.filter ?? 'none',
          opacity: ready ? 1 : 0,
        }}
      />

      {/* Bottom scrim — the stamp has to stay legible over a blown-out sky. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/65 to-transparent" />

      <div className="absolute bottom-1.5 right-2">
        <Stamp capturedAt={capturedAt} imageReady={ready} />
      </div>

      {shot.caption && (
        <p
          lang={shot.caption_lang ?? lang}
          className="pointer-events-none absolute inset-x-2 bottom-1.5 line-clamp-2 pr-16 text-left text-[11px] text-paper/90 drop-shadow"
        >
          {shot.caption}
        </p>
      )}

      {/* Open action sits under the report button in the stacking order. */}
      {onClick && (
        <button
          type="button"
          onClick={() => onClick(shot)}
          aria-label={shot.caption || t('corner.expand')}
          className="absolute inset-0 z-10 h-full w-full"
        />
      )}

      {onReport && (
        <button
          type="button"
          onClick={() => onReport(shot)}
          aria-label={t('corner.report')}
          // Visible on touch, where there is no hover to reveal it; quieter on
          // pointer devices until the card is hovered or focused.
          className="absolute right-1.5 top-1.5 z-20 rounded-full bg-dusk/70 p-2 text-ash opacity-80 transition-opacity hover:text-paper focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <Flag size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
