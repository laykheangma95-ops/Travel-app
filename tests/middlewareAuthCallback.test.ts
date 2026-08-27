import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AUTH_RETURN_TO_COOKIE } from '@/lib/authRouting';

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _anonKey: string,
    options: {
      cookies: {
        setAll: (
          cookies: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) => void;
      };
    }
  ) => ({
    auth: {
      exchangeCodeForSession: async (code: string, flow?: { flowId?: string }) => {
        const result = await exchangeCodeForSession(code, flow);
        if (!result?.error) {
          options.cookies.setAll([
            {
              name: 'sb-test-auth-token',
              value: 'session-cookie',
              options: { path: '/', sameSite: 'lax' },
            },
          ]);
        }
        return result;
      },
      verifyOtp: async (...args: unknown[]) => verifyOtp(...args),
    },
  }),
}));

async function loadMiddleware() {
  vi.resetModules();
  return import('../middleware');
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  verifyOtp.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.domner.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DOMNER_E2E_AUTH', '');
  vi.stubEnv('NEXT_PUBLIC_E2E_AUTH', '');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('middleware auth callback', () => {
  it('redirects a successful OAuth code exchange straight to the intended page', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { middleware } = await loadMiddleware();
    const request = new NextRequest(
      'https://travel-app-eight-eta.vercel.app/auth/callback?code=pkce-code&returnTo=%2Fsettings'
    );

    const response = await middleware(request);

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get('location')).toBe('https://travel-app-eight-eta.vercel.app/settings');
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('session-cookie');
    expect(response.headers.get('location')).not.toContain('/auth/callback');
    expect(response.cookies.get(AUTH_RETURN_TO_COOKIE)?.value ?? '').toBe('');
  });

  it('keeps OAuth failures on the callback route with the error attached', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error('invalid request: both auth code and code verifier should be non-empty'),
    });

    const { middleware } = await loadMiddleware();
    const request = new NextRequest(
      'https://travel-app-eight-eta.vercel.app/auth/callback?code=pkce-code&returnTo=%2Fsettings'
    );

    const response = await middleware(request);

    expect(response.headers.get('location')).toContain('/auth/callback');
    expect(response.headers.get('location')).toContain('error_description=');
    expect(response.headers.get('location')).toContain('returnTo=%2Fsettings');
  });

  it('does not retry a callback when Supabase already returned an OAuth error', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { middleware } = await loadMiddleware();
    const request = new NextRequest(
      'https://travel-app-eight-eta.vercel.app/auth/callback?code=4%2F0Aexample&error_description=Unable%20to%20exchange%20external%20code%3A%204%2F0Aexample&returnTo=%2Fsettings'
    );

    const response = await middleware(request);
    const location = response.headers.get('location');

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location).toBe(
      'https://travel-app-eight-eta.vercel.app/auth/callback?returnTo=%2Fsettings&error_description=Unable+to+exchange+external+code%3A+4%2F0Aexample'
    );
    expect(location).not.toContain('code=');
  });
});
