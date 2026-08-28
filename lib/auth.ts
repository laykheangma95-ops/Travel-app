// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { getSupabase } from '@/lib/supabase';
import {
  demoModeAllowed,
  phoneAuthEnabled,
  phoneOtpExpirySeconds,
  phoneOtpResendSeconds,
} from '@/lib/env';
import {
  AUTH_RETURN_TO_COOKIE,
  AUTH_RETURN_TO_MAX_AGE_SECONDS,
  DEFAULT_AUTH_RETURN_TO,
  normalizeReturnTo,
  readReturnTo,
} from '@/lib/authRouting';

export type OAuthProvider = 'google' | 'apple';
const RETURN_TO_STORAGE_KEY = 'domner-return-to';
const PHONE_AUTH_CAPTCHA_ACTION = 'phone-auth';

export interface AuthResult {
  error: string | null;
  /** True when Supabase is not configured and we fell through to demo mode. */
  demo?: boolean;
}

export interface PhoneAuthProof {
  /**
   * Reserved for the future CAPTCHA handshake. The current shipping SDK in this
   * repo does not yet expose a typed browser hook for it, so phone auth remains
   * disabled unless the production-hardening flags are explicitly present.
   */
  captchaToken?: string | null;
}

export interface AuthStatus {
  signedIn: boolean;
  userId: string | null;
}

const DEMO: AuthResult = { error: null, demo: true };

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function currentReturnTo(): string | null {
  if (typeof window === 'undefined') return null;

  const fromQuery = readReturnTo(new URLSearchParams(window.location.search));
  if (fromQuery) return fromQuery;

  const fromCookie = normalizeReturnTo(readCookie(AUTH_RETURN_TO_COOKIE), '');
  if (fromCookie) return fromCookie;

  try {
    const fromStorage = normalizeReturnTo(sessionStorage.getItem(RETURN_TO_STORAGE_KEY), '');
    return fromStorage || null;
  } catch {
    return null;
  }
}

function clearReturnTo(): void {
  if (typeof window === 'undefined') return;
  clearCookie(AUTH_RETURN_TO_COOKIE);
  try {
    sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
  } catch {
    // Private-browsing contexts can reject sessionStorage; the cookie is the
    // cross-tab and cross-context fallback.
  }
}

function phoneAuthBlocked(): AuthResult | null {
  if (phoneAuthEnabled) return null;
  return { error: 'auth.error.phoneDisabled' };
}

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
  if (text.includes('email address not authorized')) return 'auth.error.emailUnavailable';
  if (
    text.includes('email link is invalid or has expired') ||
    text.includes('link is invalid or has expired') ||
    text.includes('expired_action_link') ||
    text.includes('otp has expired')
  ) {
    return 'auth.error.callbackExpired';
  }
  if (text.includes('token has expired') || text.includes('otp_expired')) {
    return 'auth.error.codeExpired';
  }
  if (text.includes('invalid token') || text.includes('token is invalid')) {
    return 'auth.error.codeInvalid';
  }
  if (
    text.includes('redirect_uri_mismatch') ||
    text.includes('redirect url') ||
    text.includes('redirect_to') ||
    text.includes('callback url mismatch')
  ) {
    return 'auth.error.redirectMismatch';
  }
  if (
    text.includes('access denied') ||
    text.includes('access_denied') ||
    text.includes('cancelled') ||
    text.includes('canceled')
  ) {
    return 'auth.error.cancelled';
  }
  if (
    text.includes('network') ||
    text.includes('fetch failed') ||
    text.includes('failed to fetch') ||
    text.includes('load failed')
  ) {
    return 'auth.error.network';
  }
  if (
    text.includes('unable to exchange external code') ||
    text.includes('external code')
  ) {
    return 'auth.error.oauthExchangeFailed';
  }
  if (
    text.includes('code verifier') ||
    text.includes('auth code') ||
    text.includes('invalid grant') ||
    text.includes('pkce')
  ) {
    return 'auth.error.callbackSync';
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
  const url = new URL(path, window.location.origin);
  const returnTo = currentReturnTo();
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

/**
 * Where to send the user after a successful sign-in. Checkout stashes this so
 * a traveller who signs in mid-purchase lands back on their cart.
 */
export function consumeReturnTo(fallback = '/dashboard'): string {
  const stored = currentReturnTo();
  clearReturnTo();
  return stored ?? fallback;
}

export function setReturnTo(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeReturnTo(path, DEFAULT_AUTH_RETURN_TO);
  writeCookie(AUTH_RETURN_TO_COOKIE, normalized, AUTH_RETURN_TO_MAX_AGE_SECONDS);
  try {
    sessionStorage.setItem(RETURN_TO_STORAGE_KEY, normalized);
  } catch {
    // The cookie is the durable path across tabs, mail apps and PWA contexts.
  }
}

export function authCallbackBusyCopy(): { title: string; subtitle: string; detail: string } {
  return {
    title: 'Signing you in',
    subtitle: 'One moment…',
    detail: 'We are finishing your sign-in securely.',
  };
}

export function isPhoneAuthEnabled(): boolean {
  return phoneAuthEnabled;
}

export function phoneAuthTiming() {
  return {
    resendSeconds: Number.isFinite(phoneOtpResendSeconds) ? Math.max(1, phoneOtpResendSeconds) : 60,
    expirySeconds: Number.isFinite(phoneOtpExpirySeconds) ? Math.max(1, phoneOtpExpirySeconds) : 60,
    captchaAction: PHONE_AUTH_CAPTCHA_ACTION,
  };
}

export async function readServerAuthStatus(): Promise<AuthStatus> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('auth.error.callbackSync');
  const body = (await response.json()) as Partial<AuthStatus>;
  return {
    signedIn: body.signedIn === true,
    userId: typeof body.userId === 'string' ? body.userId : null,
  };
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
export async function sendPhoneCode(
  phoneE164: string,
  createUser: boolean,
  _proof?: PhoneAuthProof
): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const blocked = phoneAuthBlocked();
  if (blocked) return blocked;
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: createUser },
  });
  return { error: friendlyAuthError(error?.message) };
}

export async function verifyPhoneCode(phoneE164: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const blocked = phoneAuthBlocked();
  if (blocked) return blocked;
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: 'sms' });
  return { error: friendlyAuthError(error?.message) };
}

/** Attach a phone to an already signed-in account (Settings → verify later). */
export async function startPhoneLink(
  phoneE164: string,
  _proof?: PhoneAuthProof
): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const blocked = phoneAuthBlocked();
  if (blocked) return blocked;
  const { error } = await supabase.auth.updateUser({ phone: phoneE164 });
  return { error: friendlyAuthError(error?.message) };
}

export async function confirmPhoneLink(phoneE164: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return unconfigured();
  const blocked = phoneAuthBlocked();
  if (blocked) return blocked;
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: 'phone_change',
  });
  if (error) return { error: friendlyAuthError(error.message) };

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
  if (linkError) {
    const friendly = friendlyAuthError(linkError);
    return {
      error: friendly === 'auth.error.callbackExpired' ? 'auth.error.recoveryExpired' : friendly,
      ready: false,
    };
  }

  const tokenHash = query.get('token_hash');
  if (tokenHash && query.get('type') === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    if (error) {
      const friendly = friendlyAuthError(error.message);
      return {
        error: friendly === 'auth.error.callbackExpired' ? 'auth.error.recoveryExpired' : friendly,
        ready: false,
      };
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    const friendly = friendlyAuthError(error.message);
    return {
      error: friendly === 'auth.error.callbackExpired' ? 'auth.error.recoveryExpired' : friendly,
      ready: false,
    };
  }
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
