/**
 * Admin helpers: wallet allowlist check + audit log writer.
 *
 * Admin auth piggybacks on the existing SIWE → JWT flow. The JWT carries
 * `wallet` in its payload; we compare it to the comma-separated
 * `ADMIN_WALLETS` env var. No DB role table, no second auth system.
 *
 * To rotate admins, change the env var and redeploy.
 */

import { NextRequest } from 'next/server';
import { verifyTokenPayload } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface AdminIdentity {
  userId: string;
  wallet: string;
}

let _allowlistCache: { raw: string; set: Set<string> } | null = null;
function parseAllowlist(): Set<string> {
  const raw = process.env.ADMIN_WALLETS || '';
  if (_allowlistCache && _allowlistCache.raw === raw) return _allowlistCache.set;
  const set = new Set(
    raw
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^0x[a-f0-9]{40}$/.test(w))
  );
  _allowlistCache = { raw, set };
  return set;
}

/**
 * Verify the request carries a valid JWT for an allowlisted wallet.
 * Returns the admin identity on success, or a Response (401/403) to return.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AdminIdentity | Response> {
  const payload = await verifyTokenPayload(request);
  if (!payload) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const allowlist = parseAllowlist();
  if (allowlist.size === 0) {
    logger.error('ADMIN_WALLETS env not configured — rejecting admin request');
    return Response.json({ error: 'admin_not_configured' }, { status: 503 });
  }

  const wallet = (payload.wallet || '').toLowerCase();
  if (!allowlist.has(wallet)) {
    logger.warn('Admin access denied for non-allowlisted wallet', { wallet });
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  return { userId: payload.sub, wallet };
}

/**
 * Write an admin action to admin_audit_log. If this fails, the caller should
 * NOT proceed with the side-effecting action — a silent admin action is
 * worse than a failed one.
 */
export async function logAdminAction(params: {
  adminWallet: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_user: params.adminWallet,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    details: params.details ?? {},
  });
  if (error) {
    throw new Error(`admin_audit_log write failed: ${error.message}`);
  }
}

/**
 * Generate a random EPP invite code: `EPP-XXXX` using the same Crockford
 * alphabet used elsewhere.
 */
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateInviteCode(): string {
  let code = 'EPP-';
  for (let i = 0; i < 4; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}
