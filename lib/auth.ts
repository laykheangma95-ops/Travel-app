// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { getSupabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'apple';

export interface AuthResult {
  error: string | null;
  /** True when Supabase is not configured and we fell through to demo mode. */
  demo?: boolean;
}

const DEMO: AuthResult = { error: null, demo: true };

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
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl() },
  });
  return { error: error?.message ?? null };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
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
  if (!supabase) return DEMO;
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
  return { error: error?.message ?? null };
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
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: createUser, emailRedirectTo: redirectUrl() },
  });
  return { error: error?.message ?? null };
}

export async function verifyEmailCode(email: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  return { error: error?.message ?? null };
}

/** SMS one-time code. Offered, never required — see docs/AUTH.md. */
export async function sendPhoneCode(phoneE164: string, createUser: boolean): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: createUser },
  });
  return { error: error?.message ?? null };
}

export async function verifyPhoneCode(phoneE164: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: 'sms' });
  return { error: error?.message ?? null };
}

/** Attach a phone to an already signed-in account (Settings → verify later). */
export async function startPhoneLink(phoneE164: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.updateUser({ phone: phoneE164 });
  return { error: error?.message ?? null };
}

export async function confirmPhoneLink(phoneE164: string, token: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
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

export async function resetPassword(email: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return DEMO;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl(),
  });
  return { error: error?.message ?? null };
}
