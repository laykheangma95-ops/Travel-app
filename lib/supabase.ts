import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { createE2EBrowserSupabase, e2eAuthEnabled } from './e2eAuth';

/**
 * Browser Supabase client.
 *
 * Uses `createBrowserClient` so the session is stored in COOKIES rather than
 * localStorage. That is what lets the middleware and every API route verify the
 * caller server-side — with localStorage the server sees nothing, which is why
 * the admin panel previously had to trust a client-side flag.
 *
 * Returns null when the project has not been configured, so features can fall
 * back to local behavior in development.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const e2e = createE2EBrowserSupabase();
  if (e2e) return e2e;
  if (e2eAuthEnabled()) return {} as SupabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}

/**
 * Service-role client. Bypasses Row Level Security entirely, so it must never
 * be constructed anywhere reachable from the browser bundle — API routes and
 * server components only.
 */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
