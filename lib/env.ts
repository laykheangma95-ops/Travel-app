// ─────────────────────────────────────────────────────────────────────────────
// Environment & configuration guard — the single source of truth for
// "is this service configured, and are we allowed to fake it?"
//
// WHY THIS EXISTS:
//   Every integration used to answer that question for itself with an inline
//   `if (!process.env.X) return demoData`. That is how an unpaid order ended up
//   being written to the database with status 'paid': one missing env var on a
//   production deploy silently turned the checkout into a free vending machine.
//
// THE RULE:
//   Demo fallbacks are a DEVELOPMENT convenience. In production a missing key
//   is an outage, never a discount. `assertConfigured()` throws instead.
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceName =
  | 'supabase'
  | 'supabaseAdmin'
  | 'stripe'
  | 'stripeWebhook'
  | 'aba'
  | 'abaWebhook'
  | 'resend'
  | 'telegram'
  | 'firebase'
  | 'aeroDataBox';

/** True on a real deployment. Vercel sets NODE_ENV=production on every build. */
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Escape hatch for staging/preview deploys that intentionally run without live
 * payment credentials. Must be set explicitly — it is never on by default, so
 * a forgotten variable can never silently enable it.
 *
 * Two variable names, one rule. `lib/auth.ts` runs in the BROWSER, and a
 * browser bundle can only see variables prefixed `NEXT_PUBLIC_` — every other
 * `process.env` read compiles to `undefined` there. Without the public twin,
 * client-side auth would compute a different answer to "may I fake this?" than
 * the server does, which is the exact kind of drift that let a missing key look
 * like a successful sign-in. Staging sets both; production sets neither.
 */
export const allowDemoInProduction =
  process.env.DOMNER_ALLOW_DEMO === 'true' ||
  process.env.NEXT_PUBLIC_DOMNER_ALLOW_DEMO === 'true';

/** Demo fallbacks are permitted only outside production, or with the explicit opt-in. */
export const demoModeAllowed = !isProduction || allowDemoInProduction;

const required: Record<ServiceName, string[]> = {
  supabase: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  supabaseAdmin: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  stripeWebhook: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  aba: ['ABA_MERCHANT_ID', 'ABA_API_KEY'],
  abaWebhook: ['ABA_WEBHOOK_SECRET'],
  resend: ['RESEND_API_KEY'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_CHAT_ID'],
  firebase: ['FIREBASE_ADMIN_SDK'],
  aeroDataBox: ['RAPIDAPI_KEY'],
};

/** Which of a service's variables are missing from the environment. */
export function missingVars(service: ServiceName): string[] {
  return required[service].filter((key) => !process.env[key]?.trim());
}

/** True when every variable a service needs is present. */
export function isConfigured(service: ServiceName): boolean {
  return missingVars(service).length === 0;
}

/**
 * Thrown when a service is unconfigured in an environment where faking it
 * would be dangerous. API routes translate this into a 503 — never a success.
 */
export class ConfigurationError extends Error {
  readonly service: ServiceName;
  readonly missing: string[];

  constructor(service: ServiceName, missing: string[]) {
    super(
      `${service} is not configured (missing: ${missing.join(', ')}). ` +
        'Refusing to fall back to demo behavior in production.'
    );
    this.name = 'ConfigurationError';
    this.service = service;
    this.missing = missing;
  }
}

/**
 * Guard for any money- or trust-critical path.
 *
 * Returns `true`  → the service is live, use it.
 * Returns `false` → unconfigured, but we are in development, so a clearly
 *                   labelled demo fallback is acceptable.
 * Throws          → unconfigured in production. The caller must fail the request.
 */
export function assertConfigured(service: ServiceName): boolean {
  const missing = missingVars(service);
  if (missing.length === 0) return true;
  if (!demoModeAllowed) throw new ConfigurationError(service, missing);
  return false;
}

/** Public base URL of the app, used for return URLs and canonical links. */
export function appUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** Emails allowed into the admin panel. Comma-separated, case-insensitive. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A production deployment with no admin allowlist would let the role check
 * fall open, so we treat an empty list as "nobody is an admin" and log loudly
 * at startup instead.
 */
export function adminConfigured(): boolean {
  return adminEmails().length > 0;
}

/** One-line readiness summary, surfaced by /api/health. */
export function configReport(): Record<ServiceName | 'admin', boolean> {
  const services = Object.keys(required) as ServiceName[];
  const report = {} as Record<ServiceName | 'admin', boolean>;
  for (const service of services) report[service] = isConfigured(service);
  report.admin = adminConfigured();
  return report;
}
