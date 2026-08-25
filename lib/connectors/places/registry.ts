// ─────────────────────────────────────────────────────────────────────────────
// Place-import connector registry — which adapter, if any, reads a platform.
//
// Mirrors lib/providers/places/registry.ts exactly: a Map, one register() call
// per adapter, and a lookup that returns null rather than throwing. THE
// DEFAULT IS NO CONNECTOR — a platform with nothing registered (xiaohongshu,
// today) is a normal, expected state, not a misconfiguration, and every caller
// handles null (CLAUDE.md §11: the app runs with an empty `.env`).
// ─────────────────────────────────────────────────────────────────────────────

import { linkConnector } from './linkConnector';
import type { LinkPlatform } from '@/lib/travel/socialLink';
import type { PlaceConnector } from './types';

const byPlatform = new Map<LinkPlatform, PlaceConnector>();

function register(connector: PlaceConnector): void {
  for (const platform of connector.platforms) {
    byPlatform.set(platform, connector);
  }
}

register(linkConnector);

// A platform-specific connector (an official TikTok partner API, a licensed
// RED integration) slots in here once there is an owner decision behind it —
// register() after linkConnector so it takes the platform, and add the
// vendor's own timeout/retry/logging inside its own adapter file, exactly like
// lib/providers/places/registry.ts's note on adding a real maps vendor.

/** Test seam, mirroring lib/providers/places/registry.ts. */
export function __registerConnectorForTest(connector: PlaceConnector): void {
  register(connector);
}

export function __resetConnectorsForTest(): void {
  byPlatform.clear();
  register(linkConnector);
}

/** The connector for a platform, or null when none is registered. Never throws. */
export function getConnectorFor(platform: LinkPlatform): PlaceConnector | null {
  const connector = byPlatform.get(platform);
  if (!connector || !connector.isConfigured()) return null;
  return connector;
}
