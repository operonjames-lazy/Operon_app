import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client (singleton per cold start).
 *
 * Uses the service role key — NEVER expose to browser. Browser code MUST
 * import from `@/lib/supabase/browser` instead. The `'server-only'` import
 * above hard-fails the Next 16 build at compile time if any 'use client'
 * component reaches this module, even transitively.
 *
 * Authorization is enforced at the API route layer via verifyToken().
 * Safe as singleton in serverless — each instance is single-tenant.
 */

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

let _serverClient: SupabaseClient | null = null;
export function createServerSupabase(): SupabaseClient {
  if (_serverClient) return _serverClient;
  _serverClient = createClient(getUrl(), getServiceKey());
  return _serverClient;
}
