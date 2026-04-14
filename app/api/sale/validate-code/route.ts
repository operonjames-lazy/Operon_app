import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 req/min/IP to prevent code enumeration
    const rateLimited = await rateLimit(request, 'validate-code', 10);
    if (rateLimited) return rateLimited;

    const { code, chain } = await request.json() as { code?: string; chain?: 'arbitrum' | 'bsc' };

    if (!code || typeof code !== 'string') {
      return Response.json(
        { valid: false, discountBps: 0, codeType: null },
        { status: 400 }
      );
    }

    // Validate format: OPRN-XXXX (EPP partner) or OPR-XXXXXX (community)
    const normalizedCode = code.toUpperCase();
    if (!/^OPRN-[A-Z0-9]{4}$/.test(normalizedCode) && !/^OPR-[A-Z0-9]{6}$/.test(normalizedCode)) {
      return Response.json({ valid: false, discountBps: 0, codeType: null });
    }

    const supabase = createServerSupabase();

    // Read sale config for discount rates
    const { data: config } = await supabase
      .from('sale_config')
      .select('community_discount_bps, epp_discount_bps')
      .single();

    // Authenticated caller (optional) — used to block self-referral.
    // verifyToken returns null for unauthenticated requests; the flow still
    // works but self-referral won't be caught at this layer until signin.
    const callerUserId = await verifyToken(request);

    // 1. Check EPP partner codes first
    const { data: partner } = await supabase
      .from('epp_partners')
      .select('referral_code, tier, status, user_id')
      .eq('referral_code', normalizedCode)
      .eq('status', 'active')
      .single();

    if (partner) {
      if (callerUserId && partner.user_id === callerUserId) {
        return Response.json({ valid: false, discountBps: 0, codeType: 'epp', reason: 'self_referral' });
      }
      if (chain === 'arbitrum' || chain === 'bsc') {
        const { data: syncRow } = await supabase
          .from('referral_code_chain_state')
          .select('status')
          .eq('code', normalizedCode)
          .eq('chain', chain)
          .maybeSingle();
        if (!syncRow || syncRow.status !== 'synced') {
          return Response.json({ valid: false, discountBps: 0, codeType: 'epp', reason: 'pending_sync' });
        }
      }
      return Response.json({
        valid: true,
        discountBps: config?.epp_discount_bps ?? 1500,
        codeType: 'epp',
      });
    }

    // 2. Check community referral codes (always, regardless of stage)
    const { data: communityUser } = await supabase
      .from('users')
      .select('id, referral_code')
      .eq('referral_code', normalizedCode)
      .single();

    if (communityUser) {
      if (callerUserId && communityUser.id === callerUserId) {
        return Response.json({ valid: false, discountBps: 0, codeType: 'community', reason: 'self_referral' });
      }
      if (chain === 'arbitrum' || chain === 'bsc') {
        const { data: syncRow } = await supabase
          .from('referral_code_chain_state')
          .select('status')
          .eq('code', normalizedCode)
          .eq('chain', chain)
          .maybeSingle();
        if (!syncRow || syncRow.status !== 'synced') {
          return Response.json({ valid: false, discountBps: 0, codeType: 'community', reason: 'pending_sync' });
        }
      }
      return Response.json({
        valid: true,
        discountBps: config?.community_discount_bps ?? 1000,
        codeType: 'community',
      });
    }

    return Response.json({ valid: false, discountBps: 0, codeType: null });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to validate code' },
      { status: 500 }
    );
  }
}
