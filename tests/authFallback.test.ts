import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The regression this file exists for: with NEXT_PUBLIC_SUPABASE_ANON_KEY absent
// on a production deploy, getSupabase() returned null and every function in
// lib/auth.ts answered `{ error: null, demo: true }`. Callers read `demo` as
// "success, skip ahead", so clicking Sign In pushed the visitor to /dashboard
// with no account created, no password checked and no session issued — a
// missing variable presenting as a working login.
//
// Same shape as the Stripe bug in env.test.ts: in production a missing key is
// an outage, never a discount.

async function loadAuth() {
  // lib/env captures isProduction at import time, and lib/auth captures
  // demoModeAllowed from it, so each case needs a fresh module registry.
  vi.resetModules();
  return import('@/lib/auth');
}

beforeEach(() => {
  // The guard logs the cause for whoever is debugging the deploy; keep it out
  // of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Strips Supabase out of the environment, whatever the shell happened to set. */
function withoutSupabase() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
}

describe('auth with Supabase unconfigured', () => {
  describe('in production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DOMNER_ALLOW_DEMO', '');
      vi.stubEnv('NEXT_PUBLIC_DOMNER_ALLOW_DEMO', '');
      withoutSupabase();
    });

    it('REFUSES to report a sign-in as successful', async () => {
      const { signInWithPassword } = await loadAuth();
      const result = await signInWithPassword('traveller@example.com', 'hunter2');

      // Both halves matter. `demo` false is what stops the page calling
      // finish() and pushing to /dashboard; a non-null error is what makes the
      // failure visible instead of silent.
      expect(result.demo).not.toBe(true);
      expect(result.error).toBeTruthy();
    });

    it('REFUSES to report a sign-up as successful', async () => {
      const { signUpWithPassword } = await loadAuth();
      const result = await signUpWithPassword('traveller@example.com', 'hunter2', {
        fullName: 'Sok Dara',
        passportCountry: 'KH',
      });

      expect(result.demo).not.toBe(true);
      expect(result.error).toBeTruthy();
    });

    it('refuses every other credential path too', async () => {
      const auth = await loadAuth();

      const results = await Promise.all([
        auth.signInWithProvider('google'),
        auth.sendEmailCode('traveller@example.com', false),
        auth.verifyEmailCode('traveller@example.com', '123456'),
        auth.sendPhoneCode('+85512345678', false),
        auth.verifyPhoneCode('+85512345678', '123456'),
        auth.resetPassword('traveller@example.com'),
        auth.verifyRecoveryCode('traveller@example.com', '123456'),
        auth.updatePassword('hunter2'),
      ]);

      for (const result of results) {
        expect(result.demo).not.toBe(true);
        expect(result.error).toBeTruthy();
      }
    });

    it('does not offer a password form it has no authority to submit', async () => {
      const { consumeRecoveryLink } = await loadAuth();
      const result = await consumeRecoveryLink();

      // `ready: true` would render the new-password form and then silently drop
      // the password, which is how the reset flow used to fail.
      expect(result.ready).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('in development', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
      withoutSupabase();
    });

    it('keeps the demo fallback, so the app still runs on an empty .env', async () => {
      // CLAUDE.md §11: every external service degrades to a demo/no-op when its
      // env var is missing. That stays true off production.
      const { signInWithPassword } = await loadAuth();
      const result = await signInWithPassword('traveller@example.com', 'hunter2');

      expect(result.demo).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('on a staging deploy that opts in', () => {
    it('honours the escape hatch through its NEXT_PUBLIC_ twin', async () => {
      // lib/auth runs in the browser, where only NEXT_PUBLIC_ variables exist.
      // Without this twin, client auth and the server would disagree about
      // whether faking is permitted.
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DOMNER_ALLOW_DEMO', '');
      vi.stubEnv('NEXT_PUBLIC_DOMNER_ALLOW_DEMO', 'true');
      withoutSupabase();

      const { signInWithPassword } = await loadAuth();
      const result = await signInWithPassword('traveller@example.com', 'hunter2');

      expect(result.demo).toBe(true);
      expect(result.error).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The regression this section exists for: a sign-in method that is wired in
// code but not switched on in the Supabase dashboard answered with
// "Unsupported provider: provider is not enabled" — and that string went
// straight to the customer. A Khmer-speaking traveller mid-purchase saw a
// developer's configuration note in English and read it as a broken website.
//
// Recognised failures become an i18n key so AuthError can render them in the
// reader's language. Unrecognised ones must pass through untouched: inventing
// friendly copy for an error we have not seen would hide real faults.
// ─────────────────────────────────────────────────────────────────────────────

describe('friendlyAuthError', () => {
  it('maps a disabled OAuth provider to guidance the customer can act on', async () => {
    const { friendlyAuthError } = await loadAuth();

    expect(friendlyAuthError('Unsupported provider: provider is not enabled')).toBe(
      'auth.error.providerUnavailable'
    );
  });

  it('maps a missing SMS provider to the email path that always works', async () => {
    const { friendlyAuthError } = await loadAuth();

    expect(friendlyAuthError('Error sending confirmation OTP to provider')).toBe(
      'auth.error.phoneUnavailable'
    );
  });

  it('keeps a wrong password distinct from an unavailable method', async () => {
    const { friendlyAuthError } = await loadAuth();

    // These must never collapse into one message: one is the customer's
    // mistake to correct, the other is ours and no retry will fix it.
    expect(friendlyAuthError('Invalid login credentials')).toBe('auth.error.badCredentials');
  });

  it('passes an unrecognised error through unchanged', async () => {
    const { friendlyAuthError } = await loadAuth();

    const odd = 'Database connection terminated unexpectedly';
    expect(friendlyAuthError(odd)).toBe(odd);
  });

  it('returns null when there was no error', async () => {
    const { friendlyAuthError } = await loadAuth();

    expect(friendlyAuthError(null)).toBeNull();
    expect(friendlyAuthError(undefined)).toBeNull();
  });
});
