// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { getSupabase } from '@/lib/supabase';
import { demoModeAllowed } from '@/lib/env';

export type OAuthProvider = 'google' | 'apple';

export interface AuthResult {
  error: string | null;
  /** True when Supabase is not configured and we fell through to demo mode. */
  demo?: boolean;
}

const DEMO: AuthResult = { error: null, demo: true };

/**
 * Shown when Supabase is missing on a real deployment. Deliberately vague about
 * the cause — a visitor cannot act on "the anon key is unset", and naming the
 * broken component to the public buys us nothing.
 */
const UNAVAILABLE =
  'Sign-in is temporarily unavailable. Please try again in a few minutes — ' +
  'if it keeps happening, contact support and we will sort it out.';

/**
 * Turns a raw Supabase error into something a traveller can act on.
 *
 * WHY: Supabase answers a sign-in method that has not been switched on in the
 * dashboard with "Unsupported provider: provider is not enabled". That string
 * was going straight to the customer — a developer's configuration note, in
 * English, shown to a Khmer-speaking traveller mid-purchase. It reads as a
 * broken website, and it tells them nothing about what to do instead.
 *
 * Recognised errors are returned as an i18n KEY rather than a sentence, so
 * `AuthError` can render them in the reader's language. Anything unrecognised
 * passes through unchanged — inventing friendly copy for an error we have not
 * seen would hide real failures behind a shrug.
 *
 * This maps presentation only. No method is enabled, disabled or bypassed
 * here, and the locked invariants are untouched: phone stays optional, and the
 * email paths that work with no cellular service are not involved.
 */
export function friendlyAuthError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.toLowerCase();

  // Google or Apple is wired in code but not switched on in Supabase.
  if (
    text.includes('provider is not enabled') ||
    text.includes('unsupported provider') ||
    text.includes('oauth provider')
  ) {
    return 'auth.error.providerUnavailable';
  }

  // Phone sign-in with no SMS provider configured, or SMS that could not send.
  if (
    text.includes('sms') ||
    text.includes('phone provider') ||
    text.includes('error sending confirmation otp') ||
    text.includes('unsupported phone')
  ) {
    return 'auth.error.phoneUnavailable';
  }

  if (text.includes('invalid login credentials')) return 'auth.error.badCredentials';
  if (text.includes('email not confirmed')) return 'auth.error.emailNotConfirmed';
  if (text.includes('token has expired') || text.includes('otp_expired')) {
    return 'auth.error.codeExpired';
  }
  if (text.includes('invalid token') || text.includes('token is invalid')) {
    return 'auth.error.codeInvalid';
  }
  if (text.includes('rate limit') || text.includes('too many')) return 'auth.error.tooMany';
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'auth.error.emailTaken';
  }

  return raw;
}

/**
 * What every function below returns when `getSupabase()` hands back null.
 *
 * WHY THIS IS NOT JUST `DEMO`:
 *   It used to be. Every caller reads `demo` as "success, skip ahead", so a
 *   production deploy that was missing NEXT_PUBLIC_SUPABASE_ANON_KEY answered
 *   every sign-in and sign-up with `{ error: null, demo: true }` — no account
 *   created, no password checked, no session issued — and the pages happily
 *   pushed the visitor to /dashboard. A missing key presented as a working
 *   login. `lib/env.ts` already had the rule ("in production a missing key is
 *   an outage, never a discount"); auth was the one trust-critical path that
 *   never adopted it. This adopts it.
 *
 * Development keeps the demo fallback, so the app still runs with an empty
 * `.env` exactly as CLAUDE.md §11 requires.
 */
function unconfigured(): AuthResult {
  if (demoModeAllowed) return DEMO;
  // Surfaces in the browser console and in Vercel's function logs, so the cause
  // is one click away instead of a mystery.
  console.error(
    '[auth] Supabase is not configured on a production deploy. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy. ' +
      'Refusing to fall through to demo mode.'
  );
  return { error: UNAVAILABLE, demo: false };
}

function redirectUrl(path = '/auth/callback'): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${path}`;
}

/**
 * Where to send the user after a successful sign-in. Checkout stashes this so
 * a traveller who signs in mid-purchase lands back on their cart.
 */
export function consumeReturnTo(fallback = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback;
  const stored = sessionStorage.getItem('domner-return-to');
  sessionStorage.removeItem('domner-return-to');
  return stored ?? fallback;
}

export function setReturnTo(path: string): void {
  if (typeof window !== 'undefined') sessionStorage.setItem('domner-return-to', path);
}

export async function signInWithProvider(provider: OAuthProvider): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl() },
  });
  return { error: friendlyAuthError(error?.message) };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: friendlyAuthError(error?.message) };
}

export interface SignUpProfile {
  fullName: string;
  phone?: string;
  passportCountry: string;
  preferredLanguage?: string;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  profile: SignUpProfile
): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl(),
      data: {
        full_name: profile.fullName,
        // Stored unverified. `phone_verified_at` on the profile is the only
        // thing that counts as a verified number.
        phone: profile.phone || null,
        passport_country: profile.passportCountry,
        preferred_language: profile.preferredLanguage ?? 'km',
      },
    },
  });
  return { error: friendlyAuthError(error?.message) };
}

/**
 * Email one-time code. This is the traveller-safe path: it works on airport
 * wi-fi with no cellular service at all, which is the exact situation most of
 * our customers are in when they buy.
 *
 * Requires the Supabase "Magic Link" email template to include {{ .Token }} so
 * the mail carries a 6-digit code, not just a link — links break when the mail
 * app opens them in a different browser than the one holding the session.
 */
export async function sendEmailCode(email: string, createUser: boolean): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: createUser, emailRedirectTo: redirectUrl() },
  });
  return { error: friendlyAuthError(error?.message) };
}

export async function verifyEmailCode(email: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  return { error: friendlyAuthError(error?.message) };
}

/** SMS one-time code. Offered, never required — see docs/AUTH.md. */
export async function sendPhoneCode(phoneE164: string, createUser: boolean): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: createUser },
  });
  return { error: friendlyAuthError(error?.message) };
}

export async function verifyPhoneCode(phoneE164: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: 'sms' });
  return { error: friendlyAuthError(error?.message) };
}

/** Attach a phone to an already signed-in account (Settings → verify later). */
export async function startPhoneLink(phoneE164: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.updateUser({ phone: phoneE164 });
  return { error: friendlyAuthError(error?.message) };
}

export async function confirmPhoneLink(phoneE164: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: 'phone_change',
  });
  if (error) return { error: error.message };

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase
      .from('profiles')
      .update({ phone: phoneE164, phone_verified_at: new Date().toISOString() })
      .eq('id', data.user.id);
  }
  return { error: null };
}

/**
 * Sends the reset mail. The link lands on /reset-password, which is the only
 * page that can actually set a new one — /auth/callback just forwards a signed
 * in user onward, so pointing recovery at it silently dropped the reset.
 */
export async function resetPassword(email: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl('/reset-password'),
  });
  return { error: friendlyAuthError(error?.message) };
}

export interface RecoveryLink extends AuthResult {
  /** True when a recovery session exists and a new password can be set now. */
  ready: boolean;
}

/**
 * Turns whatever the reset mail put in the URL into a usable session.
 *
 * Supabase can deliver recovery three different ways depending on the project's
 * flow setting and email template, so all three are handled: `?token_hash=` is
 * verified explicitly, while `?code=` (PKCE) and the `#access_token=` fragment
 * are picked up by detectSessionInUrl before getSession() resolves.
 *
 * A false `ready` is not a failure — it means the link is missing, spent, or
 * was opened in a different browser than the one that asked for it, and the
 * caller should fall back to the emailed code.
 */
export async function consumeRecoveryLink(): Promise<RecoveryLink> {
  const supabase = getSupabase();
  if (!supabase) {
    // `ready: true` would hand the visitor a new-password form we have no
    // authority to submit, so it stays tied to whether demo mode is permitted.
    const fallback = unconfigured();
    return { ...fallback, ready: fallback.demo === true };
  }
  if (typeof window === 'undefined') return { error: null, ready: false };

  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const linkError = query.get('error_description') ?? fragment.get('error_description');
  if (linkError) return { error: linkError, ready: false };

  const tokenHash = query.get('token_hash');
  if (tokenHash && query.get('type') === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    if (error) return { error: error.message, ready: false };
  }

  const { data } = await supabase.auth.getSession();
  return { error: null, ready: Boolean(data.session) };
}

/**
 * The typed-code path into a reset, for when the link itself cannot work: mail
 * apps open links in their own in-app browser, which is a different session
 * than the tab that requested the reset. Same reasoning as sendEmailCode, and
 * it needs {{ .Token }} in the Supabase "Reset Password" template.
 */
export async function verifyRecoveryCode(email: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  return { error: friendlyAuthError(error?.message) };
}

/** Sets a new password on the session established by the recovery step. */
export async function updatePassword(password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const { error } = await supabase.auth.updateUser({ password });
  return { error: friendlyAuthError(error?.message) };
}
