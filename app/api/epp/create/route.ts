import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';

const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0/O, 1/I/L

function generateReferralCode(): string {
  let code = 'OPRN-';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invite_code, email, wallet_address, wallet_chain, telegram, display_name, lang } = body;

    // Validate inputs
    if (!invite_code || !/^EPP-[A-Z0-9]{4}$/.test(invite_code)) {
      return Response.json({ error: 'invite_invalid' }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return Response.json({ error: 'invalid_wallet' }, { status: 400 });
    }
    if (!wallet_chain || !['bsc', 'arbitrum'].includes(wallet_chain)) {
      return Response.json({ error: 'invalid_chain' }, { status: 400 });
    }

    const walletLower = wallet_address.toLowerCase();
    const supabase = createServerSupabase();

    // Check invite
    const { data: invite } = await supabase
      .from('epp_invites')
      .select('*')
      .eq('invite_code', invite_code)
      .single();

    if (!invite) return Response.json({ error: 'invite_invalid' }, { status: 400 });
    if (invite.status === 'used') return Response.json({ error: 'invite_used' }, { status: 400 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json({ error: 'invite_expired' }, { status: 400 });
    }

    // Generate unique referral code (retry on unique constraint violation)
    let referralCode = generateReferralCode();

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        primary_wallet: walletLower,
        email,
        display_name: display_name || null,
        language: lang || 'en',
        is_epp: true,
      })
      .select('id')
      .single();

    if (userError) {
      if (userError.code === '23505') {
        if (userError.message.includes('email')) return Response.json({ error: 'email_taken' }, { status: 400 });
        if (userError.message.includes('wallet')) return Response.json({ error: 'wallet_taken' }, { status: 400 });
      }
      return Response.json({ error: 'server_error' }, { status: 500 });
    }

    // Create EPP partner (retry with new code on unique constraint violation)
    let partnerError: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase
        .from('epp_partners')
        .insert({
          user_id: user!.id,
          invite_id: invite.id,
          referral_code: referralCode,
          payout_wallet: walletLower,
          payout_chain: wallet_chain,
          telegram: telegram || null,
          display_name: display_name || null,
          email,
        });

      if (!error) {
        partnerError = null;
        break;
      }

      // If unique constraint violation on referral_code, regenerate and retry
      if (error.code === '23505' && error.message.includes('referral_code')) {
        referralCode = generateReferralCode();
        partnerError = error;
        continue;
      }

      // Other error — stop retrying
      partnerError = error;
      break;
    }

    if (partnerError) {
      // Rollback user creation
      await supabase.from('users').delete().eq('id', user!.id);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }

    // Mark invite as used
    await supabase
      .from('epp_invites')
      .update({ status: 'used', used_by: user!.id, used_at: new Date().toISOString() })
      .eq('invite_code', invite_code);

    // Admin notification (fire and forget)
    if (process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_CHAT_ID) {
      fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TG_ADMIN_CHAT_ID,
          text: `New Elite Partner\n\nName: ${display_name || '—'}\nEmail: ${email}\nCode: ${referralCode}\nChain: ${wallet_chain}\nInvite: ${invite_code}`,
        }),
      }).catch(() => {});
    }

    return Response.json({
      referral_code: referralCode,
      referral_link: `https://app.operon.network?ref=${referralCode}`,
      email,
      wallet: `${walletLower.slice(0, 6)}...${walletLower.slice(-4)}`,
      chain: wallet_chain,
    });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
