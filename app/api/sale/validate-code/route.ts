import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 req/min/IP to prevent code enumeration
    const rateLimited = await rateLimit(request, 'validate-code', 10);
    if (rateLimited) return rateLimited;

    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return Response.json(
        { valid: false, discountBps: 0, codeType: null },
        { status: 400 }
      );
    }

    // Validate format: OPRN-XXXX
    const normalizedCode = code.toUpperCase();
    if (!/^OPRN-[A-Z0-9]{4}$/.test(normalizedCode)) {
      return Response.json({ valid: false, discountBps: 0, codeType: null });
    }

    const supabase = createServerSupabase();

    // Read sale config for discount rates
    const { data: config } = await supabase
      .from('sale_config')
      .select('community_discount_bps, epp_discount_bps')
      .single();

    // 1. Check EPP partner codes first
    const { data: partner } = await supabase
      .from('epp_partners')
      .select('referral_code, tier, status')
      .eq('referral_code', normalizedCode)
      .eq('status', 'active')
      .single();

    if (partner) {
      return Response.json({
        valid: true,
        discountBps: config?.epp_discount_bps ?? 1500,
        codeType: 'epp',
      });
    }

    // 2. Check community referral codes (always, regardless of stage)
    const { data: communityUser } = await supabase
      .from('users')
      .select('referral_code')
      .eq('referral_code', normalizedCode)
      .single();

    if (communityUser) {
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
