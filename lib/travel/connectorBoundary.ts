// ─────────────────────────────────────────────────────────────────────────────
// The one door a connector's output passes through before anything downstream
// sees it.
//
// WHY THIS EXISTS:
//   A ConnectorExtraction (lib/connectors/places/types.ts) is UNTRUSTED input,
//   exactly like a model's JSON in lib/travel/placeAgent.ts — "our own adapter
//   wrote it" is not a safety property, and a future connector may be reading
//   an API that misbehaves, lies, or is compromised. This is the only place
//   that turns "whatever a connector returned" into "what
//   lib/travel/importOrchestrator.ts is allowed to persist".
//
// WHAT IT REFUSES TO CARRY THROUGH:
//   Oversized text, coordinates outside the physical range, a confidence
//   outside [0,1], a thumbnail URL that is not https, and connector metadata
//   that is not a small bag of primitives. None of this throws — a connector
//   returning nonsense produces a smaller, honest extraction, the same way
//   normaliseCandidate() drops a single bad candidate rather than failing the
//   whole import.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConnectorExtraction } from '@/lib/connectors/places/types';

/** A caption longer than this is not a caption. Matches placeAgent's own cap. */
const MAX_CAPTION_CHARS = 6_000;
const MAX_TITLE_CHARS = 300;
const MAX_CANDIDATE_NAME_CHARS = 200;
const MAX_CANDIDATE_NAMES = 25;
const MAX_METADATA_BYTES = 2_048;
const MAX_METADATA_KEYS = 20;

export interface SanitizedConnectorResult {
  connectorId: string;
  sourceUrl: string;
  externalId: string | null;
  title: string | null;
  captionText: string | null;
  candidateNames: string[];
  locationHint: { city: string | null; country: string | null };
  coordinates: { lat: number; lng: number } | null;
  thumbnailUrl: string | null;
  confidence: number;
  connectorMetadata: Record<string, string | number | boolean>;
  extractedAt: string;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function coordinate(value: ConnectorExtraction['coordinates']): { lat: number; lng: number } | null {
  if (!value) return null;
  const { lat, lng } = value;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * https-only, length-capped — the same rule linkPreview.ts applies to a
 * thumbnail before it reaches a traveler's `<img>`. A connector is not
 * exempted from it just because it is Domner's own code.
 */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function confidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Connector metadata, kept to a small bag of primitives.
 *
 * A connector reading a real vendor API could otherwise hand back that
 * vendor's entire raw payload under `connectorMetadata` — exactly the thing
 * lib/providers/places/types.ts forbids adapters from doing with a place. This
 * is the enforcement of that rule for the connector port: nested objects,
 * arrays, and anything past the first twenty keys are dropped rather than
 * stored, and the whole thing is dropped if it does not fit in 2KB once
 * serialized.
 */
function metadata(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  let keys = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (keys >= MAX_METADATA_KEYS) break;
    if (typeof entry === 'string') {
      out[key] = entry.slice(0, 300);
      keys += 1;
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      out[key] = entry;
      keys += 1;
    } else if (typeof entry === 'boolean') {
      out[key] = entry;
      keys += 1;
    }
    // Anything else — an object, an array, NaN, a function — is silently
    // dropped rather than stringified: the point is to keep this a bag of
    // facts, not a place to smuggle a vendor payload through as a JSON string.
  }
  try {
    if (JSON.stringify(out).length > MAX_METADATA_BYTES) return {};
  } catch {
    return {};
  }
  return out;
}

function isoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  // A connector that returned a bad or missing timestamp still happened now.
  return new Date().toISOString();
}

/**
 * The only door. Everything lib/travel/importOrchestrator.ts reads off a
 * connector's result comes from here, never from the raw ConnectorExtraction.
 */
export function sanitizeConnectorResult(raw: ConnectorExtraction): SanitizedConnectorResult {
  const candidateNames = Array.isArray(raw.candidateNames)
    ? raw.candidateNames
        .filter((name): name is string => typeof name === 'string' && name.trim().length >= 2)
        .map((name) => name.trim().slice(0, MAX_CANDIDATE_NAME_CHARS))
        .slice(0, MAX_CANDIDATE_NAMES)
    : [];

  return {
    connectorId: text(raw.connectorId, 80) ?? 'unknown',
    sourceUrl: text(raw.sourceUrl, 2_048) ?? '',
    externalId: text(raw.externalId, 200),
    title: text(raw.title, MAX_TITLE_CHARS),
    captionText: text(raw.captionText, MAX_CAPTION_CHARS),
    candidateNames,
    locationHint: {
      city: text(raw.locationHint?.city, 80),
      country: text(raw.locationHint?.country, 80),
    },
    coordinates: coordinate(raw.coordinates),
    thumbnailUrl: httpsUrl(raw.media?.thumbnailUrl),
    confidence: confidence(raw.confidence),
    connectorMetadata: metadata(raw.connectorMetadata),
    extractedAt: isoTimestamp(raw.extractedAt),
  };
}
