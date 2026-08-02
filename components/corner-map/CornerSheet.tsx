'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CORNER SHEET — docs/corner-map-spec.md §3 (layout, motion) and §5.2.
//
// Three detents: peek (the near-you rail only), half (the corner list), full
// (one corner in detail). The sheet is the whole navigation model — there is
// no tab bar, because a tab bar would compete with the map.
//
// Note what the header does *not* show: who posted. Poster identity is
// minimal and off the map layer entirely (§1 rule 4). You see the place.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Navigation } from 'lucide-react';
import { freshnessOf } from '@/lib/corner-map/freshness';
import { cornerName, directionsUrl, minutesSince } from '@/lib/corner-map/format';
import { fetchCornerShots, reportShot } from '@/lib/corner-map/api';
import type { CornerWithHeat, ReportReason, Shot } from '@/lib/corner-map/types';
import { useLang } from '@/lib/i18n';
import { ShotCard } from './ShotCard';
import { ReportDialog } from './ReportDialog';

export type Detent = 'peek' | 'half' | 'full';

/** Detent heights as a fraction of the viewport. Peek is fixed in px so the
 *  rail is always exactly one thumbnail tall, whatever the screen. */
const PEEK_PX = 190;
const HALF_VH = 0.52;
const FULL_VH = 0.88;

interface CornerSheetProps {
  corners: CornerWithHeat[];
  railShots: Shot[];
  selected: CornerWithHeat | null;
  onSelect: (corner: CornerWithHeat | null) => void;
  savedIds: Set<string>;
  onToggleSave: (cornerId: string) => void;
  detent: Detent;
  onDetentChange: (d: Detent) => void;
}

export function CornerSheet({
  corners,
  railShots,
  selected,
  onSelect,
  savedIds,
  onToggleSave,
  detent,
  onDetentChange,
}: CornerSheetProps) {
  const { t, lang } = useLang();
  const [shots, setShots] = useState<Shot[]>([]);
  const [loadingShots, setLoadingShots] = useState(false);
  const [reporting, setReporting] = useState<Shot | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number; active: boolean }>({
    startY: 0,
    startH: 0,
    active: false,
  });
  const [dragH, setDragH] = useState<number | null>(null);

  useEffect(() => setNow(new Date()), []);

  // Selecting a corner loads its rail and opens the sheet to detail.
  useEffect(() => {
    if (!selected) {
      setShots([]);
      return;
    }
    let cancelled = false;
    setLoadingShots(true);
    fetchCornerShots(selected.id)
      .then((s) => {
        if (!cancelled) setShots(s);
      })
      .catch(() => {
        if (!cancelled) setShots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingShots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const heightFor = useCallback((d: Detent): number => {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    if (d === 'peek') return PEEK_PX;
    return Math.round(vh * (d === 'half' ? HALF_VH : FULL_VH));
  }, []);

  // ── Drag to a detent. Snap by where you let go, biased by direction. ─────
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startH: heightFor(detent), active: true };
    setDragH(heightFor(detent));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const vh = window.innerHeight;
    const next = drag.current.startH - (e.clientY - drag.current.startY);
    setDragH(Math.max(PEEK_PX * 0.6, Math.min(vh * FULL_VH, next)));
  };

  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const h = dragH ?? heightFor(detent);
    const detents: Detent[] = ['peek', 'half', 'full'];
    // Nearest detent by height — simple, and it never lands between two.
    const nearest = detents.reduce((best, d) =>
      Math.abs(heightFor(d) - h) < Math.abs(heightFor(best) - h) ? d : best
    );
    setDragH(null);
    onDetentChange(nearest);
    if (nearest === 'peek') onSelect(null);
  };

  const height = dragH ?? heightFor(detent);

  const handleReport = async (reason: ReportReason) => {
    if (!reporting) return;
    try {
      await reportShot(reporting.id, reason);
    } catch {
      // A failed report must not eat the interaction — the dialog still
      // confirms, and the row is retried by the user if it mattered.
    }
  };

  const liveCount = now
    ? corners.filter((c) => c.last_shot_at && freshnessOf(new Date(c.last_shot_at), now) === 'LIVE')
        .length
    : 0;

  return (
    <>
      <div
        ref={sheetRef}
        data-dragging={drag.current.active ? 'true' : 'false'}
        style={{ height }}
        className="corner-sheet absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-white/5 bg-slab/95 backdrop-blur-xl"
      >
        {/* Drag handle. Also a real button, so the sheet is operable without
            a pointer — keyboard users cycle the detents. */}
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => onDetentChange(detent === 'full' ? 'peek' : detent === 'half' ? 'full' : 'half')}
          aria-label={detent === 'full' ? t('corner.collapse') : t('corner.expand')}
          className="flex w-full shrink-0 touch-none justify-center py-3"
        >
          <span className="h-1 w-10 rounded-full bg-ash/50" aria-hidden="true" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {selected ? (
            <CornerDetail
              corner={selected}
              shots={shots}
              loading={loadingShots}
              saved={savedIds.has(selected.id)}
              onToggleSave={() => onToggleSave(selected.id)}
              onReport={setReporting}
              now={now}
            />
          ) : (
            <NearYou
              corners={corners}
              railShots={railShots}
              liveCount={liveCount}
              detent={detent}
              onSelect={(c) => {
                onSelect(c);
                onDetentChange('full');
              }}
              onReport={setReporting}
              now={now}
            />
          )}
        </div>
      </div>

      <ReportDialog
        open={reporting !== null}
        onClose={() => setReporting(null)}
        onSubmit={handleReport}
      />
    </>
  );
}

// ── Peek / half: what's near you ───────────────────────────────────────────

function NearYou({
  corners,
  railShots,
  liveCount,
  detent,
  onSelect,
  onReport,
  now,
}: {
  corners: CornerWithHeat[];
  railShots: Shot[];
  liveCount: number;
  detent: Detent;
  onSelect: (c: CornerWithHeat) => void;
  onReport: (s: Shot) => void;
  now: Date | null;
}) {
  const { t } = useLang();

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="corner-label text-xs tracking-[0.18em] text-ash">{t('corner.nearYou')}</h2>
        {liveCount > 0 && (
          <span className="corner-label text-xs tracking-[0.18em] text-live">
            · {t('corner.liveCount', { n: liveCount })}
          </span>
        )}
      </div>

      {/* Horizontal shot rail — the peek detent is exactly this tall. */}
      {railShots.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
          {railShots.map((shot) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              onReport={onReport}
              onClick={() => {
                const c = corners.find((x) => x.id === shot.corner_id);
                if (c) onSelect(c);
              }}
              className="h-28 w-28 shrink-0"
            />
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-ash">{t('corner.noShotsYet')}</p>
      )}

      {/* Corner list appears from the half detent up. */}
      {detent !== 'peek' && (
        <ul className="mt-4 flex flex-col gap-1">
          {corners.map((c) => (
            <li key={c.id}>
              <CornerRow corner={c} onSelect={() => onSelect(c)} now={now} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CornerRow({
  corner,
  onSelect,
  now,
}: {
  corner: CornerWithHeat;
  onSelect: () => void;
  now: Date | null;
}) {
  const { t, lang } = useLang();
  const name = cornerName(corner, lang);
  const tier = now && corner.last_shot_at ? freshnessOf(new Date(corner.last_shot_at), now) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-dusk/60"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          tier === 'LIVE' ? 'animate-live-pulse bg-live' : tier === 'TODAY' ? 'bg-dust' : 'bg-ash'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span lang={name.primaryLang} className="corner-label block truncate text-sm text-paper">
          {name.primary}
        </span>
        {name.secondary && (
          <span lang={name.secondaryLang} className="corner-label block truncate text-xs text-ash">
            {name.secondary}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-ash">
        {corner.shot_count > 0 ? t('corner.shotCount', { n: corner.shot_count }) : ''}
      </span>
    </button>
  );
}

// ── Full: one corner ───────────────────────────────────────────────────────

function CornerDetail({
  corner,
  shots,
  loading,
  saved,
  onToggleSave,
  onReport,
  now,
}: {
  corner: CornerWithHeat;
  shots: Shot[];
  loading: boolean;
  saved: boolean;
  onToggleSave: () => void;
  onReport: (s: Shot) => void;
  now: Date | null;
}) {
  const { t, lang } = useLang();
  const name = cornerName(corner, lang);
  const last = corner.last_shot_at ? new Date(corner.last_shot_at) : null;
  const tier = now && last ? freshnessOf(last, now) : null;

  // "● LIVE — 12 min ago" or "Last seen 3 days ago" (§5.2).
  let status = t('corner.noShotsYet');
  if (now && last) {
    const mins = minutesSince(last, now);
    if (tier === 'LIVE') {
      status = mins < 1 ? t('corner.justNow') : t('corner.minAgo', { n: mins });
    } else if (mins < 1440) {
      status = t('corner.lastSeen', { when: t('corner.hoursAgo', { n: Math.floor(mins / 60) }) });
    } else {
      status = t('corner.lastSeen', { when: t('corner.daysAgo', { n: Math.floor(mins / 1440) }) });
    }
  }

  return (
    <>
      <header className="mb-4">
        <h2 lang={name.primaryLang} className="corner-label text-xl font-semibold text-paper">
          {name.primary}
        </h2>
        {name.secondary && (
          <p lang={name.secondaryLang} className="corner-label text-sm text-ash">
            {name.secondary}
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="corner-label capitalize text-ash">{corner.category}</span>
          <span className="text-ash" aria-hidden="true">
            ·
          </span>
          <span
            className={`corner-label flex items-center gap-1 ${
              tier === 'LIVE' ? 'text-live' : 'text-ash'
            }`}
          >
            {tier === 'LIVE' && (
              <span aria-hidden="true" className="animate-live-pulse text-[8px]">
                ●
              </span>
            )}
            {tier === 'LIVE' ? `${t('corner.live')} — ${status}` : status}
          </span>
        </p>
      </header>

      {/* Actions. Both wrap rather than truncate — Khmer runs longer (§8). */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          className={`corner-label flex flex-1 basis-40 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
            saved ? 'bg-paper/10 text-paper' : 'bg-paper text-dusk hover:bg-paper/90'
          }`}
        >
          {saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
          {saved ? t('corner.saved') : t('corner.save')}
        </button>

        <a
          href={directionsUrl(corner)}
          target="_blank"
          rel="noopener noreferrer"
          className="corner-label flex flex-1 basis-32 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-paper transition-colors hover:bg-dusk/60"
        >
          <Navigation size={16} aria-hidden="true" />
          {t('corner.directions')}
        </a>
      </div>

      {/* Shot rail, newest first, freshness treatment applied per shot. */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-dusk/70" />
          ))}
        </div>
      ) : shots.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {shots.map((shot, i) => (
            <ShotCard key={shot.id} shot={shot} onReport={onReport} priority={i < 2} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-ash">{t('corner.noShotsYet')}</p>
      )}
    </>
  );
}
