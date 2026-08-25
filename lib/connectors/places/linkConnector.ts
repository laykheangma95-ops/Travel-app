// ─────────────────────────────────────────────────────────────────────────────
// The one connector Domner has today: read whatever the platform already
// publishes for a link preview.
//
// NOT A NEW FETCH SURFACE. This calls fetchLinkPreview (oEmbed / OpenGraph,
// lib/travel/linkPreview.ts) and, for a Google Maps link, resolveFinalUrl
// (lib/travel/mapsResolve.ts) — the exact two functions
// app/api/travel/extract already uses. Both guard themselves with an
// exact-match host allowlist, checked before any socket opens and re-checked
// at every redirect hop. This file opens no socket of its own.
//
// WHY XIAOHONGSHU HAS NO CONNECTOR:
//   RED publishes no oEmbed endpoint and Domner does not scrape. Registering
//   this connector for 'xiaohongshu' would mean adding its hosts to
//   linkPreview's allowlist, which Phase 3 explicitly declined to do — see
//   docs/PLACE-IMPORT.md, "Classification is not permission to fetch". A link
//   with no registered connector fails cleanly with `no_connector`
//   (lib/travel/importOrchestrator.ts) rather than silently trying to read a
//   site that never agreed to be read.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import { allowedMapsUrl, resolveFinalUrl, TOTAL_TIMEOUT_MS as MAPS_TIMEOUT_MS } from '@/lib/travel/mapsResolve';
import { fetchLinkPreview } from '@/lib/travel/linkPreview';
import { parseGoogleMapsUrl } from '@/lib/travel/mapsLink';
import type { LinkPlatform } from '@/lib/travel/socialLink';
import type { ConnectorExtraction, ConnectorJob, PlaceConnector } from './types';
import { ConnectorError } from './types';

export const LINK_CONNECTOR_ID = 'link-preview';

const SUPPORTED_PLATFORMS: readonly LinkPlatform[] = [
  'tiktok',
  'instagram',
  'facebook',
  'youtube',
  'google-maps',
  'web',
];

async function extractMapsLink(job: ConnectorJob): Promise<ConnectorExtraction> {
  const start = allowedMapsUrl(job.url);
  if (!start) {
    throw new ConnectorError(LINK_CONNECTOR_ID, 'Not a Google Maps link we can resolve.');
  }

  try {
    const chain = await resolveFinalUrl(start, Date.now() + MAPS_TIMEOUT_MS);
    const place = parseGoogleMapsUrl(chain.url.toString());

    return {
      connectorId: LINK_CONNECTOR_ID,
      platform: 'google-maps',
      sourceUrl: chain.url.toString(),
      externalId: null,
      title: place?.name ?? null,
      captionText: null,
      candidateNames: place?.name ? [place.name] : [],
      locationHint: { city: null, country: null },
      coordinates: place ? { lat: place.lat, lng: place.lng } : null,
      media: null,
      // A resolved Maps link is an exact pin, not a guess.
      confidence: place ? 0.95 : 0,
      connectorMetadata: { resolvedHops: true },
      extractedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new ConnectorError(
      LINK_CONNECTOR_ID,
      error instanceof Error ? error.message.slice(0, 160) : 'Could not resolve the Maps link.',
      { retryable: false }
    );
  }
}

async function extractSocialLink(job: ConnectorJob): Promise<ConnectorExtraction> {
  const preview = await fetchLinkPreview(job.url);

  if (preview.outcome !== 'ok') {
    // Not a throw: a blocked or unsupported preview is an ordinary, expected
    // outcome (Instagram/Facebook usually refuse us) and the orchestrator
    // handles a low-confidence, caption-less extraction as "nothing to read"
    // rather than as a connector failure.
    return {
      connectorId: LINK_CONNECTOR_ID,
      platform: job.platform,
      sourceUrl: job.url,
      externalId: null,
      title: preview.title,
      captionText: null,
      candidateNames: [],
      locationHint: { city: null, country: null },
      coordinates: null,
      media: { thumbnailUrl: preview.thumbnailUrl },
      confidence: 0,
      connectorMetadata: { previewOutcome: preview.outcome },
      extractedAt: new Date().toISOString(),
    };
  }

  return {
    connectorId: LINK_CONNECTOR_ID,
    platform: job.platform,
    sourceUrl: job.url,
    externalId: null,
    title: preview.title,
    captionText: preview.caption,
    candidateNames: [],
    locationHint: { city: null, country: null },
    coordinates: null,
    media: { thumbnailUrl: preview.thumbnailUrl },
    confidence: preview.caption ? 0.5 : 0.1,
    connectorMetadata: { previewOutcome: preview.outcome, author: preview.author },
    extractedAt: new Date().toISOString(),
  };
}

/**
 * The generic link-preview connector.
 *
 * `isConfigured()` is always true: unlike a paid provider, oEmbed and
 * OpenGraph need no credential. It is registered for every platform Domner
 * can legitimately read today, and for none it cannot.
 */
export const linkConnector: PlaceConnector = {
  id: LINK_CONNECTOR_ID,
  platforms: SUPPORTED_PLATFORMS,
  isConfigured: () => true,
  async extract(job: ConnectorJob): Promise<ConnectorExtraction> {
    if (job.platform === 'google-maps') return extractMapsLink(job);
    return extractSocialLink(job);
  },
};
