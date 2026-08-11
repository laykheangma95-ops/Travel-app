// Everything the mock reads from the environment, in one place.
//
// Defaults are chosen so `npm run mock` works with an empty .env — the same
// rule the rest of the app follows.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num('MOCK_PORT', 4000),

  /** Credentials the mock demands. Match these to GOHUB_PARTNER_ID / GOHUB_API_KEY. */
  partnerId: process.env.MOCK_PARTNER_ID?.trim() || 'domner-mock-partner',
  apiKey: process.env.MOCK_API_KEY?.trim() || 'domner-mock-key',

  startingBalance: num('MOCK_STARTING_BALANCE', 5_000_000),

  fulfilDelayMs: num('MOCK_FULFILL_DELAY_MS', 5_000),
  /** `_SLOW` items take this long instead. */
  slowFulfilDelayMs: num('MOCK_SLOW_FULFILL_DELAY_MS', 60_000),

  webhookUrl: process.env.MOCK_WEBHOOK_URL?.trim() || 'http://localhost:3000/api/webhooks/gohub',
  hmacSecret: process.env.MOCK_HMAC_SECRET?.trim() || 'domner-mock-hmac-secret',
  /** Sends every webhook twice, so we can prove our handler is idempotent. */
  webhookDuplicate: process.env.MOCK_WEBHOOK_DUPLICATE === 'true',
  webhookRetries: num('MOCK_WEBHOOK_RETRIES', 3),

  /** Fraction of successful order creations answered with 201 instead of 200. */
  createdStatusRate: num('MOCK_201_RATE', 0.3),

  /** Where the JSON snapshot lives, so state survives a restart. */
  statePath: process.env.MOCK_STATE_PATH?.trim() || 'mock-gohub/.state.json',
  persist: process.env.MOCK_PERSIST !== 'false',

  get publicUrl(): string {
    return process.env.MOCK_PUBLIC_URL?.trim() || `http://localhost:${config.port}`;
  },
};
