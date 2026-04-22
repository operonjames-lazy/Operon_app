import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  return url;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY environment variable is required');
  return key;
}

/**
 * Server-side Supabase client (singleton per cold start).
 * Uses the service role key — NEVER expose to browser.
 * Authorization is enforced at the API route layer via verifyToken().
 * Safe as singleton in serverless — each instance is single-tenant.
 */
let _serverClient: SupabaseClient | null = null;
export function createServerSupabase(): SupabaseClient {
  if (_serverClient) return _serverClient;
  _serverClient = createClient(getUrl(), getServiceKey());
  return _serverClient;
}

/**
 * Browser-side Supabase client (singleton).
 * Uses the public anon key — safe in browser.
 * Used for Realtime subscriptions (tier sellout, config changes).
 */
let _browserClient: SupabaseClient | null = null;
export function getSupabaseBrowser(): SupabaseClient {
  if (_browserClient) return _browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for browser client');
  }
  _browserClient = createClient(url, key);
  return _browserClient;
}
