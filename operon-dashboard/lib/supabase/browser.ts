import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client (singleton).
 *
 * Uses the public anon key — safe in browser. Server-side credentials are
 * NOT importable from this file by construction; this module reads only
 * `NEXT_PUBLIC_*` vars. The companion `./server` module is `'server-only'`
 * and cannot be reached from a 'use client' component.
 *
 * Used for Realtime subscriptions (tier sellout, sale_config changes).
 * Direct row reads from the browser require explicit column GRANTs in
 * Postgres (see migration 030); without those, queries succeed with
 * empty result sets rather than 401s.
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
