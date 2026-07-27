'use client';

// ═══════════════════════════════════════════════════════════════════════════
// THE MAP — docs/corner-map-spec.md §5.1.
//
// Nodes sized by heat, coloured by the freshest tier at that corner, clustered
// below zoom 14. Only LIVE nodes pulse; nothing else on this map moves.
//
// The map never plots the user as a participant. There is a "you are here"
// dot for orientation and that is all — no other person appears on this
// surface, ever (§1).
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  addProtocol,
  Map as MapLibreMap,
  type GeoJSONSource,
  type MapMouseEvent,
  type PointLike,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { Camera, Search, X } from 'lucide-react';
import { coldestToFreshest, TIER } from '@/lib/corner-map/freshness';
import { cornerMapStyle, NODE } from '@/lib/corner-map/mapStyle';
import {
  DEFAULT_RADIUS_M,
  fetchNearbyCorners,
  fetchSavedCornerIds,
  fetchShotsForCorners,
  saveCorner,
  searchCorners,
  unsaveCorner,
} from '@/lib/corner-map/api';
import { FILTER_CATEGORIES, type CornerWithHeat, type FilterId, type Shot } from '@/lib/corner-map/types';
import { useLang, type DictKey } from '@/lib/i18n';
import { CornerSheet, type Detent } from './CornerSheet';

// Phnom Penh, for when location is unavailable or refused.
const FALLBACK: [number, number] = [104.9282, 11.5564];
const CLUSTER_MAX_ZOOM = 13; // cluster *below* zoom 14 (§5.1)
const PULSE_MS = 2400; // §3 motion: 2.4s ease-in-out

const FILTERS: { id: FilterId; key: DictKey }[] = [
  { id: 'live', key: 'corner.filter.live' },
  { id: 'food', key: 'corner.filter.food' },
  { id: 'coffee', key: 'corner.filter.coffee' },
  { id: 'temples', key: 'corner.filter.temples' },
  { id: 'openLate', key: 'corner.filter.openLate' },
];

let protocolRegistered = false;

export function CornerMapView() {
  const { t, lang } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [center, setCenter] = useState<[number, number]>(FALLBACK);
  const [locating, setLocating] = useState(true);
  const [corners, setCorners] = useState<CornerWithHeat[]>([]);
  const [railShots, setRailShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CornerWithHeat | null>(null);
  const [detent, setDetent] = useState<Detent>('peek');
  const [filters, setFilters] = useState<Set<FilterId>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // A map click can only hand back a feature id; it is resolved to a corner
  // once React has the current list (the map layer closes over stale state).
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  // Ticks the freshness recompute so nodes cool down while the map is open.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Location. Venue-snapped browsing only: this coordinate is used to pick
  // which corners to fetch and is never persisted or sent anywhere (§7).
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.longitude, pos.coords.latitude]);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  // ── Data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (locating) return;
    let cancelled = false;
    setLoading(true);

    fetchNearbyCorners(center[1], center[0], DEFAULT_RADIUS_M)
      .then(async (list) => {
        if (cancelled) return;
        setCorners(list);
        const shots = await fetchShotsForCorners(list.map((c) => c.id)).catch(() => []);
        if (!cancelled) setRailShots(shots);
      })
      .catch(() => {
        if (!cancelled) setCorners([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [center, locating]);

  useEffect(() => {
    fetchSavedCornerIds()
      .then(setSavedIds)
      .catch(() => setSavedIds(new Set()));
  }, []);

  // ── Filtering ───────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    if (filters.size === 0) return corners;
    const active = Array.from(filters);
    return corners.filter((c) => {
      for (const f of active) {
        if (f === 'live') {
          if (!c.last_shot_at || !now) return false;
          if (coldestToFreshest([new Date(c.last_shot_at)], now) !== 'LIVE') return false;
        } else {
          const cats = FILTER_CATEGORIES[f];
          if (cats && !cats.includes(c.category)) return false;
        }
      }
      return true;
    });
  }, [corners, filters, now]);

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: visible.map((c) => {
        const tier = now && c.last_shot_at ? coldestToFreshest([new Date(c.last_shot_at)], now) : null;
        return {
          // No top-level `id`: corner ids are uuids, and MapLibre only accepts
          // numeric feature ids. The id travels in `properties` instead, which
          // is what the click handler reads.
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
          properties: {
            id: c.id,
            // A corner with nothing fresh has no tier and renders cold — the
            // honest answer to "is this place alive right now".
            tier: tier ?? 'COLD',
            heat: c.heat ?? 0,
          },
        };
      }),
    }),
    [visible, now]
  );

  // ── Map init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!protocolRegistered) {
      const protocol = new Protocol();
      addProtocol('pmtiles', protocol.tile);
      protocolRegistered = true;
    }

    const map = new MapLibreMap({
      container: containerRef.current,
      style: cornerMapStyle(),
      center: FALLBACK,
      zoom: 15,
      attributionControl: { compact: true },
      // The basemap is orientation, not scenery — pitch and rotate are noise.
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    // 'style.load', not 'load': 'load' waits for the basemap's first tiles, so
    // a slow or unreachable pmtiles archive would take the corner nodes down
    // with it. The nodes are the product; the basemap is decoration, and the
    // two must fail independently.
    map.on('style.load', () => {
      map.addSource('corners', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 48,
      });

      // Clusters — deliberately colourless. A cluster is a count, not a
      // freshness claim, and marigold must never stand in for "some of these
      // might be live".
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'corners',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': NODE.slab,
          'circle-stroke-color': NODE.ash,
          'circle-stroke-width': 1,
          'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 16, 40, 30],
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'corners',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': NODE.paper },
      });

      // The pulse halo, LIVE only. Its opacity is driven by rAF below.
      map.addLayer({
        id: 'corner-pulse',
        type: 'circle',
        source: 'corners',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'tier'], 'LIVE']],
        paint: {
          'circle-color': TIER.LIVE.hex,
          'circle-opacity': 0.35,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'heat'],
            0, 14,
            1, 30,
          ],
        },
      });

      // The node itself. Size is heat; colour is the freshest tier present.
      map.addLayer({
        id: 'corner-node',
        type: 'circle',
        source: 'corners',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'tier'],
            'LIVE', TIER.LIVE.hex,
            'TODAY', TIER.TODAY.hex,
            'WEEK', TIER.WEEK.hex,
            'ARCHIVE', TIER.ARCHIVE.hex,
            NODE.ash,
          ],
          // Cold corners read as a hollow ash ring — present and tappable, but
          // visibly nothing happening. Fresh ones are solid and sized by heat.
          'circle-opacity': ['case', ['==', ['get', 'tier'], 'COLD'], 0.18, 1],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'heat'],
            0, 5,
            0.25, 8,
            1, 14,
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'tier'], 'COLD'],
            NODE.ash,
            NODE.dusk,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': ['case', ['==', ['get', 'tier'], 'COLD'], 0.85, 1],
        },
      });

      setMapReady(true);
    });

    // A cold node is 5px across; a fingertip is not. Query a box around the
    // tap so small nodes stay reachable on a phone.
    const HIT = 14;
    const click = (e: MapMouseEvent) => {
      const box: [PointLike, PointLike] = [
        [e.point.x - HIT, e.point.y - HIT],
        [e.point.x + HIT, e.point.y + HIT],
      ];
      const hits = map.queryRenderedFeatures(box, { layers: ['corner-node'] });
      const id = hits[0]?.properties?.id as string | undefined;
      if (id) {
        setPendingSelect(id);
        setDetent('full');
      }
    };
    const clusterClick = (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!hits.length) return;
      map.easeTo({ center: e.lngLat, zoom: Math.min(18, map.getZoom() + 2) });
    };
    map.on('click', 'corner-node', click);
    map.on('click', 'clusters', clusterClick);

    for (const layer of ['corner-node', 'clusters']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    // MapLibre measures its container once, at construction. On a phone that
    // size changes constantly — the URL bar collapses, the keyboard opens, the
    // device rotates — and any of those leave the canvas the wrong size until
    // something tells it to re-measure.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!pendingSelect) return;
    const corner = corners.find((c) => c.id === pendingSelect);
    if (corner) {
      setSelected(corner);
      setPendingSelect(null);
    }
  }, [pendingSelect, corners]);

  // Push data into the source whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('corners') as GeoJSONSource | undefined;
    src?.setData(geojson);
  }, [geojson, mapReady]);

  // Recentre on the user once located.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || locating) return;
    map.easeTo({ center, zoom: 15, duration: 800 });
  }, [center, mapReady, locating]);

  // ── The live pulse (§3 motion moment 1) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Reduced motion: no pulse at all, just a static ring. The rAF loop never
    // starts, so there is nothing to interrupt.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) {
      if (map.getLayer('corner-pulse')) map.setPaintProperty('corner-pulse', 'circle-opacity', 0.3);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (ts: number) => {
      if (!map.getLayer('corner-pulse')) return;
      // Ease-in-out over 2.4s, 0.10 → 0.45 opacity.
      const phase = ((ts - start) % PULSE_MS) / PULSE_MS;
      const eased = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
      map.setPaintProperty('corner-pulse', 'circle-opacity', 0.1 + eased * 0.35);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapReady]);

  // ── Interactions ────────────────────────────────────────────────────────
  const toggleFilter = (id: FilterId) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onToggleSave = useCallback(
    async (cornerId: string) => {
      const wasSaved = savedIds.has(cornerId);
      // Optimistic — the journal should feel instant.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(cornerId);
        else next.add(cornerId);
        return next;
      });
      try {
        await (wasSaved ? unsaveCorner(cornerId) : saveCorner(cornerId));
      } catch {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(cornerId);
          else next.delete(cornerId);
          return next;
        });
      }
    },
    [savedIds]
  );

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const results = await searchCorners(query).catch(() => []);
    const first = results[0];
    if (first) {
      setCenter([first.lng, first.lat]);
      setSearchOpen(false);
    }
  };

  const totalShots = corners.reduce((sum, c) => sum + (c.shot_count ?? 0), 0);
  const showEmpty = !loading && !locating && totalShots === 0;

  return (
    // `absolute inset-0` against the layout's `relative` main, rather than
    // `h-full`: a percentage height here depends on every ancestor resolving
    // one, and if any does not, the map container measures 0 and MapLibre
    // quietly falls back to a 300px canvas.
    <div className="absolute inset-0">
      {/* Sized with h-full, not `absolute inset-0`: maplibre-gl.css sets
          `.maplibregl-map { position: relative }` on this element once the map
          initialises, which cancels absolute positioning — `inset-0` then does
          nothing, the container measures 0 tall, and MapLibre silently keeps a
          300px default canvas with the map squeezed into a strip. */}
      <div ref={containerRef} className="h-full w-full bg-dusk" aria-label={t('corner.title')} />

      {/* Floating header — glass over the map (§3 layout). */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-4">
        <Link
          href="/"
          className="pointer-events-auto rounded-full bg-slab/80 px-4 py-2 backdrop-blur-md"
        >
          <span lang="km" className="font-corner-khmer text-lg leading-none text-paper">
            ជ្រុង
          </span>
        </Link>

        <div className="flex-1" />

        {searchOpen ? (
          <form onSubmit={runSearch} className="pointer-events-auto flex-1 sm:max-w-xs">
            <div className="flex items-center gap-2 rounded-full bg-slab/90 px-3 py-2 backdrop-blur-md">
              <Search size={16} className="shrink-0 text-ash" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('corner.searchPlaceholder')}
                aria-label={t('corner.search')}
                className="min-w-0 flex-1 bg-transparent text-sm text-paper placeholder:text-ash focus:outline-none"
              />
              <button type="button" onClick={() => setSearchOpen(false)} aria-label={t('corner.close')}>
                <X size={16} className="text-ash" aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t('corner.search')}
            className="pointer-events-auto rounded-full bg-slab/80 p-2.5 backdrop-blur-md"
          >
            <Search size={18} className="text-paper" aria-hidden="true" />
          </button>
        )}

        <Link
          href="/my-map"
          className="corner-label pointer-events-auto rounded-full bg-slab/80 px-4 py-2 text-xs text-paper backdrop-blur-md"
        >
          {t('corner.myMap')}
        </Link>
      </header>

      {/* Filter chips (§5.1). Wrap freely — Khmer labels run longer. */}
      <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-30 flex flex-wrap gap-2 px-4">
        {FILTERS.map((f) => {
          const on = filters.has(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFilter(f.id)}
              aria-pressed={on}
              className={`corner-label pointer-events-auto rounded-full px-3 py-1.5 text-xs backdrop-blur-md transition-colors ${
                on
                  ? // `live` is the one chip that may wear marigold, and only
                    // while it is actually filtering to live corners.
                    f.id === 'live'
                    ? 'bg-live text-dusk'
                    : 'bg-paper text-dusk'
                  : 'bg-slab/80 text-ash'
              }`}
            >
              {t(f.key)}
            </button>
          );
        })}
      </div>

      {/* §5.1 empty state. Cambodia will be sparse at launch: no spinner
          forever, no sad face — an invitation, with capture highlighted. */}
      {showEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex flex-col items-center px-8 text-center">
          <p className="corner-label text-base text-paper">{t('corner.empty.title')}</p>
          <p className="corner-label mt-1 text-sm text-ash">{t('corner.empty.cta')}</p>
        </div>
      )}

      {locating && (
        <p className="corner-label absolute inset-x-0 top-1/3 z-20 text-center text-sm text-ash">
          {t('corner.locating')}
        </p>
      )}

      {/* Capture, floating (§3). Highlighted while the map is empty. */}
      <Link
        href="/capture"
        aria-label={t('corner.capture')}
        style={{ bottom: detent === 'peek' ? '13rem' : '1.25rem' }}
        className={`corner-sheet absolute right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-colors ${
          showEmpty ? 'bg-live text-dusk' : 'bg-paper text-dusk'
        }`}
      >
        <Camera size={22} aria-hidden="true" />
      </Link>

      <CornerSheet
        corners={visible}
        railShots={railShots}
        selected={selected}
        onSelect={setSelected}
        savedIds={savedIds}
        onToggleSave={onToggleSave}
        detent={detent}
        onDetentChange={setDetent}
      />
    </div>
  );
}
