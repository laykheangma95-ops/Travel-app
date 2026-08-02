'use client';

// ═══════════════════════════════════════════════════════════════════════════
// MY MAP — docs/corner-map-spec.md §5.4. The memory journal.
//
// Saved corners plus your own shots, on your private map. `saves` is readable
// by nobody but its owner (§4 RLS), and this screen is the only place it is
// rendered.
//
// Trip grouping and the 9:16 recap export are v2 and deliberately absent.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { addProtocol, Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { coldestToFreshest, TIER } from '@/lib/corner-map/freshness';
import { cornerMapStyle, NODE } from '@/lib/corner-map/mapStyle';
import { cornerName } from '@/lib/corner-map/format';
import { fetchMyShots, fetchSavedCorners } from '@/lib/corner-map/api';
import type { OwnShot, SavedCorner } from '@/lib/corner-map/types';
import { useLang } from '@/lib/i18n';
import { ShotCard } from './ShotCard';

type View = 'map' | 'grid';

let protocolRegistered = false;

export function MyMapView() {
  const { t, lang } = useLang();
  const [view, setView] = useState<View>('grid');
  const [saved, setSaved] = useState<SavedCorner[]>([]);
  const [shots, setShots] = useState<OwnShot[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => setNow(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSavedCorners().catch(() => []), fetchMyShots().catch(() => [])])
      .then(([s, sh]) => {
        if (cancelled) return;
        setSaved(s);
        setShots(sh);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const empty = !loading && saved.length === 0 && shots.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-dusk">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Link
          href="/map"
          aria-label={t('corner.back')}
          className="rounded-full bg-slab p-2.5 text-paper"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <h1 className="corner-label flex-1 font-corner-display text-lg text-paper">
          {t('corner.myMap')}
        </h1>

        {/* Map / Grid toggle (§5.4). */}
        <div role="group" className="flex rounded-full bg-slab p-1">
          {(['map', 'grid'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`corner-label rounded-full px-3 py-1.5 text-xs transition-colors ${
                view === v ? 'bg-paper text-dusk' : 'text-ash'
              }`}
            >
              {t(v === 'map' ? 'corner.view.map' : 'corner.view.grid')}
            </button>
          ))}
        </div>
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <Bookmark size={22} className="text-ash" aria-hidden="true" />
          <p className="corner-label text-base text-paper">{t('corner.myMap.empty')}</p>
          <p className="corner-label text-sm text-ash">{t('corner.myMap.emptyCta')}</p>
          <Link
            href="/map"
            className="corner-label mt-3 rounded-xl bg-paper px-5 py-3 text-sm text-dusk"
          >
            {t('corner.title')}
          </Link>
        </div>
      ) : view === 'map' ? (
        <SavedMap corners={saved} now={now} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-10">
          {saved.length > 0 && (
            <section className="mb-8">
              <h2 className="corner-label mb-3 text-xs tracking-[0.18em] text-ash">
                {t('corner.myMap.savedCorners')}
              </h2>
              <ul className="flex flex-col gap-1">
                {saved.map((c) => {
                  const name = cornerName(c, lang);
                  return (
                    <li key={c.save_id}>
                      <div className="flex items-center gap-3 rounded-lg px-2 py-3">
                        <span className="min-w-0 flex-1">
                          <span
                            lang={name.primaryLang}
                            className="corner-label block truncate text-sm text-paper"
                          >
                            {name.primary}
                          </span>
                          {name.secondary && (
                            <span
                              lang={name.secondaryLang}
                              className="corner-label block truncate text-xs text-ash"
                            >
                              {name.secondary}
                            </span>
                          )}
                        </span>
                        <span className="corner-label shrink-0 text-xs capitalize text-ash">
                          {c.category}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {shots.length > 0 && (
            <section>
              <h2 className="corner-label mb-3 text-xs tracking-[0.18em] text-ash">
                {t('corner.myMap.yourShots')}
              </h2>
              {/* Organised by location, not by date — that is the point of the
                  journal (§1). Grouped under the corner each shot belongs to. */}
              {groupByCorner(shots).map(([cornerId, group]) => {
                const name = cornerName(group[0].corner, lang);
                return (
                  <div key={cornerId} className="mb-6">
                    <h3
                      lang={name.primaryLang}
                      className="corner-label mb-2 text-sm text-paper"
                    >
                      {name.primary}
                    </h3>
                    <div className="grid grid-cols-3 gap-1.5">
                      {group.map((s) => (
                        <ShotCard key={s.id} shot={s} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function groupByCorner(shots: OwnShot[]): [string, OwnShot[]][] {
  const map = new Map<string, OwnShot[]>();
  for (const s of shots) {
    const list = map.get(s.corner_id);
    if (list) list.push(s);
    else map.set(s.corner_id, [s]);
  }
  return Array.from(map.entries());
}

/** The private map. Same palette as the public one; nothing else is on it. */
function SavedMap({ corners, now }: { corners: SavedCorner[]; now: Date | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: corners.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
        properties: {
          tier:
            now && c.last_shot_at ? coldestToFreshest([new Date(c.last_shot_at)], now) : 'COLD',
        },
      })),
    }),
    [corners, now]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!protocolRegistered) {
      addProtocol('pmtiles', new Protocol().tile);
      protocolRegistered = true;
    }

    const map = new MapLibreMap({
      container: containerRef.current,
      style: cornerMapStyle(),
      center: corners.length ? [corners[0].lng, corners[0].lat] : [104.9282, 11.5564],
      zoom: corners.length ? 11 : 6,
      attributionControl: { compact: true },
      dragRotate: false,
    });
    mapRef.current = map;

    // 'style.load' so saved corners still render if the basemap is unreachable
    // — see the same note in CornerMapView.
    map.on('style.load', () => {
      map.addSource('saved', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'saved-node',
        type: 'circle',
        source: 'saved',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'tier'],
            'LIVE', TIER.LIVE.hex,
            'TODAY', TIER.TODAY.hex,
            'WEEK', TIER.WEEK.hex,
            'ARCHIVE', TIER.ARCHIVE.hex,
            NODE.ash,
          ],
          'circle-stroke-color': NODE.dusk,
          'circle-stroke-width': 1.5,
        },
      });
      setReady(true);
    });

    // Re-measure on container resize — see the same note in CornerMapView.
    const observer = new ResizeObserver(() => map.resize());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Only the initial centre depends on `corners`; data updates go through
    // setData below, so this must not re-run and tear the map down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('saved') as GeoJSONSource | undefined)?.setData(geojson);
  }, [geojson, ready]);

  return <div ref={containerRef} className="min-h-0 flex-1 bg-dusk" />;
}
