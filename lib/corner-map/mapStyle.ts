// ═══════════════════════════════════════════════════════════════════════════
// CORNER MAP BASEMAP — docs/corner-map-spec.md §3 and §5.1.
//
// A custom dark style over a Protomaps basemap. Protomaps rather than Mapbox
// because this is priced per map load and Cambodia volumes make that the wrong
// bill to sign up for; a .pmtiles archive is a single file on object storage
// with no per-load cost at all.
//
// The basemap is deliberately almost invisible. It exists to tell you *where*,
// and then get out of the way — the only thing on this map that should catch
// the eye is a marigold node, and marigold means one thing only: LIVE.
//
// Layer names follow the Protomaps v4 schema.
//
// ⚠ maplibre-gl is pinned to the 5.x line on purpose. Under 6.0.0 the map's
// web worker does not survive Next 14's webpack bundling — it is created and
// immediately dies, so no source ever finishes tiling and the map renders as
// a flat background with no nodes and no error in the console. Before bumping
// the major, load /map and confirm corner nodes actually paint.
// ═══════════════════════════════════════════════════════════════════════════

import type { StyleSpecification } from 'maplibre-gl';

const DUSK = '#0A0F0D';
const SLAB = '#151E1A';
const ASH = '#6F827A';
const PAPER = '#EDE8DC';

/**
 * Protomaps basemap. Unset by default — see cornerMapStyle() for what happens
 * then. Point this at your own Cambodia .pmtiles extract for production; the
 * Protomaps demo bucket is explicitly not for production traffic.
 */
export const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL || '';

/** Glyphs for map labels. Protomaps' public font stack. */
const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';

/**
 * Zero-config fallback basemap, used when NEXT_PUBLIC_PMTILES_URL is unset.
 *
 * Without this a fresh Vercel deploy renders a black rectangle: correct
 * behaviour by the letter of the spec, useless in practice, and impossible to
 * tell apart from a bug. CARTO's dark raster is what components/flights/
 * LiveMap.tsx already uses, so it is not a new vendor — and the raster paint
 * properties below pull it onto the dusk palette so the two basemaps read as
 * the same map.
 *
 * Vector Protomaps remains the production path: it is the one that avoids
 * per-load pricing at Cambodia volumes, which is the whole reason §5.1 picks it.
 */
function rasterFallbackStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': DUSK } },
      {
        id: 'carto-basemap',
        type: 'raster',
        source: 'carto',
        paint: {
          // Desaturate and darken onto the dusk palette. The basemap has to
          // stay quiet enough that a marigold node is the only thing that
          // catches the eye.
          'raster-saturation': -0.55,
          'raster-brightness-max': 0.62,
          'raster-contrast': 0.05,
          'raster-opacity': 0.85,
        },
      },
    ],
  };
}

export function cornerMapStyle(): StyleSpecification {
  if (!PMTILES_URL) return rasterFallbackStyle();

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PMTILES_URL}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: [
      // Base — near-black with a green undertone, not pure black.
      { id: 'background', type: 'background', paint: { 'background-color': DUSK } },
      {
        id: 'earth',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'earth',
        paint: { 'fill-color': DUSK },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landuse',
        paint: { 'fill-color': SLAB, 'fill-opacity': 0.45 },
      },
      // Water reads a shade *below* the base — the Mekong and the Tonlé Sap
      // should sit as voids in the city, not glow blue on a dark map.
      {
        id: 'water',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'water',
        paint: { 'fill-color': '#060A09' },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'buildings',
        minzoom: 14,
        paint: { 'fill-color': SLAB, 'fill-opacity': 0.7 },
      },
      // Roads: structure only. Thin, ash, and thinning further as you zoom out.
      {
        id: 'roads-minor',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        minzoom: 13,
        filter: ['!=', ['get', 'kind'], 'highway'],
        paint: {
          'line-color': SLAB,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 18, 4],
        },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'],
        paint: {
          'line-color': '#1E2A25',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 18, 6],
        },
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'boundaries',
        paint: { 'line-color': ASH, 'line-opacity': 0.25, 'line-dasharray': [3, 3] },
      },
      // Place labels, quiet. Ash, never paper — paper is for UI type on top.
      {
        id: 'places',
        type: 'symbol',
        source: 'protomaps',
        'source-layer': 'places',
        filter: ['<=', ['get', 'min_zoom'], 13],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 16, 13],
          'text-max-width': 7,
        },
        paint: {
          'text-color': ASH,
          'text-halo-color': DUSK,
          'text-halo-width': 1.2,
          'text-opacity': 0.75,
        },
      },
    ],
  };
}

/** Node colours, keyed to the freshness tiers. Kept beside the style so the
 *  basemap and the nodes can never drift out of the same palette. */
export const NODE = {
  paper: PAPER,
  ash: ASH,
  slab: SLAB,
  dusk: DUSK,
} as const;
