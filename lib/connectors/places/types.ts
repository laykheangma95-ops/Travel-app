// ─────────────────────────────────────────────────────────────────────────────
// The place-import connector PORT.
//
// WHY THIS EXISTS:
//   Same shape as lib/providers/places/types.ts, for the same reason. TikTok,
//   Instagram, Xiaohongshu and whatever comes after them are vendors we do not
//   control, each with a different way of telling us what a post says — a
//   public oEmbed endpoint, an official partner API, none at all. Being able to
//   add or swap one must be an adapter file plus one registry entry, never a
//   change to the job state machine in lib/travel/importOrchestrator.ts.
//
//   So the orchestrator never talks to a platform directly. Every connector
//   result is treated as UNTRUSTED — sanitized by
//   lib/travel/connectorBoundary.ts before anything in it reaches
//   import_candidates — for exactly the reason lib/travel/placeAgent.ts treats
//   a model's JSON as untrusted: "our own connector wrote it" is not a
//   safety property.
//
// WHAT A CONNECTOR IS NOT ALLOWED TO DO:
//   Touch `places`, `destination_places` or any canonical record. A connector
//   produces candidates for a human to review, exactly like the model in
//   placeAgent.ts — the review screen and the SAVE endpoint are the only door
//   onto a trip, and that door is unchanged by this file.
//
//   Bypass the SSRF boundary. A connector that fetches anything must do it
//   through lib/travel/linkPreview.ts or lib/travel/mapsResolve.ts — the two
//   places an exact-match host allowlist already exists — never open a socket
//   of its own. See lib/connectors/places/linkConnector.ts for the only
//   connector that does today.
// ─────────────────────────────────────────────────────────────────────────────

import type { LinkPlatform } from '@/lib/travel/socialLink';

/** What the orchestrator asks a connector to read. */
export interface ConnectorJob {
  /** The validated, normalized URL — already through lib/travel/urlSafety.ts. */
  url: string;
  platform: LinkPlatform;
}

/**
 * What a connector hands back, in Domner's vocabulary.
 *
 * Every field is optional-or-null by construction: a connector that does not
 * know a coordinate says so with `null`, never with an invented one. This is
 * the RAW shape — it has not yet passed through
 * lib/travel/connectorBoundary.ts and must never be persisted as-is.
 */
export interface ConnectorExtraction {
  /** Which adapter produced this. Recorded for provenance and debugging. */
  connectorId: string;
  platform: LinkPlatform;
  /** The link this extraction is actually about, after the connector's own
   *  redirect-following — may differ from the job's URL for a short link. */
  sourceUrl: string;
  /** The platform's own id for the post, when it has one. Opaque, never parsed. */
  externalId: string | null;
  title: string | null;
  /** The caption / description text. This is what place names are read out of. */
  captionText: string | null;
  /** Place names the connector itself already identified, if any — most
   *  connectors will leave this empty and rely on the caption pipeline. */
  candidateNames: string[];
  locationHint: {
    city: string | null;
    country: string | null;
  };
  /** Only ever set when the platform gave an exact pin — never geocoded here. */
  coordinates: { lat: number; lng: number } | null;
  media: { thumbnailUrl: string | null } | null;
  /** 0–1. The connector's own confidence that this extraction is usable at all. */
  confidence: number;
  /** Small, connector-specific facts worth keeping (e.g. `{ oembed: true }`).
   *  Capped and shallow-validated by the boundary — never the vendor's raw
   *  payload. */
  connectorMetadata: Record<string, unknown>;
  /** When the connector produced this, ISO-8601. */
  extractedAt: string;
}

/**
 * The port itself.
 *
 * One method: read a job, return an extraction or throw. A connector owns its
 * own timeout and its own retry policy, because only it knows what its
 * vendor's failures mean — exactly the contract in
 * lib/providers/places/types.ts.
 */
export interface PlaceConnector {
  /** Our id for the adapter, e.g. 'link-preview'. Stored for provenance. */
  readonly id: string;
  /** Which platforms this connector can read. */
  readonly platforms: readonly LinkPlatform[];
  /** False when the adapter has nothing it can do right now. Never throws. */
  isConfigured(): boolean;
  extract(job: ConnectorJob): Promise<ConnectorExtraction>;
}

/**
 * A connector failure, with the one fact the caller needs: try again later, or
 * this link is simply not readable. Mirrors PlacesProviderError.
 */
export class ConnectorError extends Error {
  readonly connectorId: string;
  readonly retryable: boolean;

  constructor(connectorId: string, message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.connectorId = connectorId;
    this.retryable = options.retryable ?? false;
  }
}
