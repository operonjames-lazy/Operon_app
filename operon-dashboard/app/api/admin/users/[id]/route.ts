import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/users/:id
 *
 * Full owner view of one user: profile, EPP partner row (if any), the
 * referral that brought them in, the 100 most recent purchases, the 100
 * most recent referrals they made, commission totals + recent 25 rows,
 * and any audit-log entries where they were the target.
 *
 * Commission totals come from the `admin_user_commission_totals` RPC so
 * Senior+ partners with >500 commission rows get correct lifetime
 * numbers. Previously summed a LIMIT-500 list in JS (Pass-3). Header
 * counts use `count: 'exact', head: true` shadow queries so "Purchases ·
 * N" / "Referrals made · N" show the real totals rather than the
 * truncated list length (Pass-3 advisory).
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 });
  }

  const db = createServerSupabase();

  try {
    const [
      userRes,
      partnerRes,
      referredByRes,
      purchasesRes,
      purchaseCountRes,
      referralsMadeRes,
      referralsMadeCountRes,
      commissionsRecentRes,
      commissionsTotalsRes,
      auditRes,
    ] = await Promise.all([
      db.from('users').select('*').eq('id', id).single(),
      db.from('epp_partners').select('*').eq('user_id', id).maybeSingle(),
      db
        .from('referrals')
        .select('referrer_id, code_used, level')
        .eq('referred_id', id)
        .maybeSingle(),
      db
        .from('purchases')
        .select('id, tx_hash, chain, tier, quantity, token, amount_usd, discount_bps, code_used, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('purchases')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', id),
      db
        .from('referrals')
        .select('referred_id, code_used, level, created_at')
        .eq('referrer_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', id),
      db
        .from('referral_purchases')
        .select('id, purchase_tx, level, commission_usd, paid_at, created_at')
        .eq('referrer_id', id)
        .order('created_at', { ascending: false })
        .limit(25),
      db.rpc('admin_user_commission_totals', { p_user_id: id }),
      db
        .from('admin_audit_log')
        .select('action, target_type, details, created_at')
        .eq('target_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (userRes.error || !userRes.data) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    const user = userRes.data;

    let referredBy: {
      id: string;
      wallet: string;
      code: string;
      level: number;
    } | null = null;
    if (referredByRes.data) {
      const { data: refUser } = await db
        .from('users')
        .select('id, primary_wallet')
        .eq('id', referredByRes.data.referrer_id)
        .single();
      if (refUser) {
        referredBy = {
          id: refUser.id,
          wallet: refUser.primary_wallet,
          code: referredByRes.data.code_used,
          level: referredByRes.data.level,
        };
      }
    }

    // Enrich referralsMade with wallet addresses
    const referredIds = (referralsMadeRes.data ?? []).map((r) => r.referred_id);
    const walletById = new Map<string, string>();
    if (referredIds.length > 0) {
      const { data: wallets } = await db
        .from('users')
        .select('id, primary_wallet')
        .in('id', referredIds);
      for (const w of wallets ?? []) walletById.set(w.id, w.primary_wallet);
    }
    const referralsMade = (referralsMadeRes.data ?? []).map((r) => ({
      referred_wallet: walletById.get(r.referred_id) || r.referred_id,
      code_used: r.code_used,
      level: r.level,
      created_at: r.created_at,
    }));

    const totals = (commissionsTotalsRes.data ?? {
      totalCents: 0,
      paidCents: 0,
      unpaidCents: 0,
    }) as { totalCents: number; paidCents: number; unpaidCents: number };

    return Response.json({
      user: {
        id: user.id,
        primary_wallet: user.primary_wallet,
        email: user.email,
        display_name: user.display_name,
        language: user.language,
        payout_chain: user.payout_chain,
        is_epp: !!user.is_epp,
        created_at: user.created_at,
        referral_code: user.referral_code,
      },
      partner: partnerRes.data
        ? {
            id: partnerRes.data.id,
            tier: partnerRes.data.tier,
            credited_amount: Number(partnerRes.data.credited_amount) || 0,
            payout_wallet: partnerRes.data.payout_wallet,
            payout_chain: partnerRes.data.payout_chain,
            telegram: partnerRes.data.telegram,
            email: partnerRes.data.email,
            status: partnerRes.data.status,
            referral_code: partnerRes.data.referral_code,
            invite_id: partnerRes.data.invite_id,
            created_at: partnerRes.data.created_at,
          }
        : null,
      referredBy,
      purchases: purchasesRes.data ?? [],
      purchaseCount: purchaseCountRes.count ?? (purchasesRes.data?.length ?? 0),
      referralsMade,
      referralsMadeCount: referralsMadeCountRes.count ?? referralsMade.length,
      commissions: {
        totalCents: totals.totalCents,
        paidCents: totals.paidCents,
        unpaidCents: totals.unpaidCents,
        recent: commissionsRecentRes.data ?? [],
      },
      auditActions: auditRes.data ?? [],
    });
  } catch (err) {
    logger.error('user detail failed', { error: String(err), userId: id });
    return Response.json({ error: 'detail_failed' }, { status: 500 });
  }
}
