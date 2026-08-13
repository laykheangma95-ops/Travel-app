// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting.
//
// WHY THIS EXISTS:
//   Nothing throttled the public endpoints. `/api/flightradar` proxies free,
//   community-funded ADS-B networks that will ban our egress IP if someone
//   loops it; `/api/payments/*` creates a database row and a gateway object per
//   call; `/api/notifications` can send a push.
//
// SCOPE — read this before trusting it:
//   This is an in-memory sliding window. On serverless it is PER INSTANCE, so
//   the effective limit is (limit × warm instances). That is a real reduction
//   in blast radius and it is honest about what it is: a cheap circuit breaker,
//   not a distributed quota. Set UPSTASH_REDIS_REST_URL to graduate to a shared
//   counter — `checkRateLimit` keeps the same signature.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from './logger';

export interface RateLimitRule {
  /** Requests permitted inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window frees up. Sent as Retry-After on a 429. */
  retryAfterSeconds: number;
}

/** Named rules so limits live in one place instead of being sprinkled per route. */
export const RATE_LIMITS = {
  /** Creates an order + a gateway payment object. Deliberately tight. */
  checkout: { limit: 5, windowMs: 60_000 },
  /** Proxies third-party ADS-B networks we do not own. */
  flightData: { limit: 30, windowMs: 60_000 },
  /** Cheap, read-only catalog data. */
  catalog: { limit: 120, windowMs: 60_000 },
  /** Sends a push notification. */
  notifications: { limit: 10, windowMs: 60_000 },
  /** Anonymous write endpoints (affiliate clicks, applications). */
  publicWrite: { limit: 20, windowMs: 60_000 },
  /** Credential checks — slow enough to make guessing pointless. */
  auth: { limit: 10, windowMs: 300_000 },
  /**
   * "Who am I and what may I do?" — read-only, and called on every admin page
   * load (twice, when onAuthStateChange fires after the initial getUser).
   *
   * Deliberately NOT the `auth` bucket. That one is sized for credential
   * guessing, so at 10 per 5 minutes an admin who opened six pages was
   * throttled out of their own panel and told they had no staff role. This
   * endpoint reveals nothing a caller does not already hold, so the limit is
   * only here to bound a runaway client.
   */
  session: { limit: 60, windowMs: 60_000 },
  /** The AI copilot: each call costs CPU and, on the paid tier, tokens. */
  chat: { limit: 20, windowMs: 60_000 },
  /**
   * Creating, editing and deleting trips. Roomier than `checkout` because
   * editing a trip is a normal, repeated act — a traveler fixing dates and
   * travellers in one sitting must not be locked out of their own plan — but
   * tighter than `session` because each one writes a row.
   */
  tripWrite: { limit: 30, windowMs: 60_000 },
  /**
   * "How much data have I got left?" — one live call to GoHub per request, so
   * it is not free the way catalog reads are. Sized for a worried traveler
   * pulling to refresh a few times, not for a polling loop.
   */
  esimUsage: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

interface Bucket {
  /** Timestamps of hits still inside the window. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();
/** Stops a hostile client from growing the map without bound. */
const MAX_TRACKED_KEYS = 10_000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number): void {
  // Amortized cleanup: at most once a minute, drop buckets with no live hits.
  if (now - lastSweep < 60_000 && buckets.size < MAX_TRACKED_KEYS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const live = bucket.hits.filter((t) => now - t < windowMs);
    if (live.length === 0) buckets.delete(key);
    else bucket.hits = live;
  }
  if (buckets.size >= MAX_TRACKED_KEYS) {
    log.warn('ratelimit.evict', { tracked: buckets.size });
    buckets.clear();
  }
}

/**
 * Best-effort client identity. `x-forwarded-for` is spoofable in general, but
 * on Vercel/Cloudflare the edge overwrites it, so the left-most entry is the
 * real peer. Falls back to a constant so an unknown client is still limited
 * rather than exempt.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    'unknown-client'
  );
}

/** Records a hit and reports whether it is permitted. */
export function checkRateLimit(
  request: Request,
  name: RateLimitName,
  identity?: string
): RateLimitResult {
  const rule = RATE_LIMITS[name];
  const now = Date.now();
  sweep(now, rule.windowMs);

  const key = `${name}:${identity ?? clientKey(request)}`;
  const bucket = buckets.get(key) ?? { hits: [] };
  const live = bucket.hits.filter((t) => now - t < rule.windowMs);

  if (live.length >= rule.limit) {
    const oldest = live[0];
    bucket.hits = live;
    buckets.set(key, bucket);
    return {
      ok: false,
      limit: rule.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000)),
    };
  }

  live.push(now);
  bucket.hits = live;
  buckets.set(key, bucket);

  return {
    ok: true,
    limit: rule.limit,
    remaining: rule.limit - live.length,
    retryAfterSeconds: 0,
  };
}

/** Test-only: drops all counters so cases do not leak into each other. */
export function __resetRateLimits(): void {
  buckets.clear();
  lastSweep = Date.now();
}
