// ─────────────────────────────────────────────────────────────────────────────
// Places provider registry — which adapter, if any, is in charge.
//
// Deliberately much smaller than lib/providers/esim/registry.ts. That one needs
// failover and circuit breaking because a supplier outage means an order that
// was paid for cannot be fulfilled. Here, no provider means a place stays
// `unverified` — a degraded answer, not a lost one — so the machinery would be
// cost without benefit. It can grow the same way if a second adapter ever earns
// it.
//
// THE DEFAULT IS NO PROVIDER.
//   `getPlacesProvider()` returns null unless `PLACES_PROVIDER` names a
//   registered adapter. Every caller handles null, because that is the state
//   Domner ships in today and the state an empty `.env` must keep working in
//   (CLAUDE.md §11).
// ─────────────────────────────────────────────────────────────────────────────

import { demoAllowed } from '@/lib/env';
import { log } from '@/lib/logger';
import { SandboxPlacesProvider, SANDBOX_PROVIDER_ID } from './sandbox';
import type { PlacesProvider } from './types';

const providers = new Map<string, PlacesProvider>();

function register(provider: PlacesProvider): void {
  providers.set(provider.id, provider);
}

register(new SandboxPlacesProvider());

// A real adapter slots in here once there is an owner decision behind it:
//   import { googlePlaces } from './google';
//   register(googlePlaces);
//
// It needs: its own timeout, its own retry/backoff, structured logging, an
// entry in lib/env.ts's `required` map so a half-configured deployment fails
// loudly, and an answer to what the vendor's terms permit us to store.

/** Test seam, mirroring lib/providers/esim/registry.ts. */
export function __registerPlacesProviderForTest(provider: PlacesProvider): void {
  register(provider);
}

export function __resetPlacesProvidersForTest(): void {
  providers.clear();
  register(new SandboxPlacesProvider());
}

/**
 * The configured provider, or null.
 *
 * `PLACES_PROVIDER=sandbox` is refused in production unless demo behaviour has
 * been explicitly switched on. The sandbox returns fixtures, and a fixture that
 * could stamp `provider_verified` on a live place would put the word "verified"
 * on data nobody verified — the exact failure the verification tiers exist to
 * prevent.
 */
export function getPlacesProvider(): PlacesProvider | null {
  const id = process.env.PLACES_PROVIDER?.trim();
  if (!id) return null;

  const provider = providers.get(id);
  if (!provider) {
    log.warn('places_provider.unknown', { id });
    return null;
  }

  if (provider.id === SANDBOX_PROVIDER_ID && !demoAllowed()) {
    log.warn('places_provider.sandbox_refused_in_production', {});
    return null;
  }

  if (!provider.isConfigured()) {
    log.warn('places_provider.unconfigured', { id: provider.id });
    return null;
  }

  return provider;
}

/** For /api/health and for saying plainly what a deployment can and cannot do. */
export function placesProviderConfigured(): boolean {
  return getPlacesProvider() !== null;
}
