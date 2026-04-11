import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { SignJWT } from 'jose';
import { SiweMessage } from 'siwe';
import { getSecret } from '@/lib/auth';
import { verifyNonce } from '@/lib/nonce';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// ─── Personal referral code generation ──────────────────────────────────
// Crockford-ish base32, no 0/O/1/I/L. ~30^6 = 729M combinations.
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generatePersonalCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = 'OPR-';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return code;
}

/**
 * Ensure the user has a unique personal referral code. Retries on the rare
 * collision against the UNIQUE constraint on users.referral_code.
 */
async function ensurePersonalCode(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  existing: string | null
): Promise<string | null> {
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePersonalCode();
    const { error } = await supabase
      .from('users')
      .update({ referral_code: code })
      .eq('id', userId)
      .is('referral_code', null); // race-safe: only set if still null
    if (!error) return code;
    // On unique collision, loop and try a new code.
  }
  logger.error('Failed to assign personal referral code after 5 attempts', { userId });
  return null;
}

/**
 * If the user is new AND a referral code was supplied at signup, attach them
 * to the owning user via the `referrals` table. This is the ONLY moment a
 * referrer can be set — per product rules, referrer is immutable after signup.
 *
 * Rejects:
 *   - unknown codes (silently ignored, referrer stays null)
 *   - self-referral (same wallet owns the code) → silently ignored, logged
 */
async function maybeAttachReferrer(
  supabase: ReturnType<typeof createServerSupabase>,
  referredUserId: string,
  referredWallet: string,
  referralCode: string | null | undefined
): Promise<void> {
  if (!referralCode) return;

  // Existing referrer row? Referrer is immutable; never overwrite.
  const { data: existing } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_id', referredUserId)
    .maybeSingle();
  if (existing) return;

  // Resolve code → owner. The code may be an EPP partner code or a
  // community personal code (`users.referral_code`).
  let ownerId: string | null = null;
  let ownerWallet: string | null = null;

  const { data: eppOwner } = await supabase
    .from('epp_partners')
    .select('user_id')
    .eq('referral_code', referralCode)
    .maybeSingle();
  if (eppOwner) {
    ownerId = eppOwner.user_id;
    const { data: ownerUser } = await supabase
      .from('users')
      .select('primary_wallet')
      .eq('id', ownerId)
      .maybeSingle();
    ownerWallet = ownerUser?.primary_wallet ?? null;
  } else {
    const { data: communityOwner } = await supabase
      .from('users')
      .select('id, primary_wallet')
      .eq('referral_code', referralCode)
      .maybeSingle();
    if (communityOwner) {
      ownerId = communityOwner.id;
      ownerWallet = communityOwner.primary_wallet;
    }
  }

  if (!ownerId) {
    logger.warn('Unknown referral code at signup — ignoring', { referralCode });
    return;
  }

  // Same-wallet self-referral: reject. Also reject same-user-id as a sanity
  // guard in case a user has multiple codes in future.
  if (ownerWallet && ownerWallet.toLowerCase() === referredWallet.toLowerCase()) {
    logger.warn('Self-referral attempted at signup', { referredWallet, referralCode });
    return;
  }
  if (ownerId === referredUserId) {
    logger.warn('Self-referral attempted at signup (user id match)', { referredUserId });
    return;
  }

  await supabase.from('referrals').insert({
    referrer_id: ownerId,
    referred_id: referredUserId,
    level: 1,
    code_used: referralCode,
  });
}

// ─── EPP partner creation (optional path used by /epp/onboard) ──────────

const EPP_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateEppReferralCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = 'OPRN-';
  for (let i = 0; i < 4; i++) {
    code += EPP_CODE_CHARSET[bytes[i] % EPP_CODE_CHARSET.length];
  }
  return code;
}

interface EppOnboardInput {
  inviteCode: string;
  email: string;
  payoutChain: 'arbitrum' | 'bsc';
  telegram?: string | null;
  displayName?: string | null;
  language?: string | null;
  termsVersion: string;
}

interface EppOnboardResult {
  ok: boolean;
  error?: string;
  referralCode?: string;
}

async function maybeCreateEppPartner(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  walletLower: string,
  input: EppOnboardInput | null
): Promise<EppOnboardResult> {
  if (!input) return { ok: true };

  // Validate invite code shape
  if (!/^EPP-[A-Z0-9]{4}$/.test(input.inviteCode)) {
    return { ok: false, error: 'invite_invalid' };
  }
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (input.payoutChain !== 'arbitrum' && input.payoutChain !== 'bsc') {
    return { ok: false, error: 'invalid_chain' };
  }

  // Look up the invite
  const { data: invite } = await supabase
    .from('epp_invites')
    .select('id, status, expires_at')
    .eq('invite_code', input.inviteCode)
    .maybeSingle();

  if (!invite) return { ok: false, error: 'invite_invalid' };
  if (invite.status === 'used') return { ok: false, error: 'invite_used' };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { ok: false, error: 'invite_expired' };
  }

  // Already a partner? (e.g. they reloaded the page after success)
  const { data: existingPartner } = await supabase
    .from('epp_partners')
    .select('referral_code')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingPartner) {
    return { ok: true, referralCode: existingPartner.referral_code };
  }

  // Generate a unique referral code, retrying on rare collisions.
  let partnerCode = '';
  let lastError: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    partnerCode = generateEppReferralCode();
    const { error } = await supabase.from('epp_partners').insert({
      user_id: userId,
      invite_id: invite.id,
      referral_code: partnerCode,
      payout_wallet: walletLower,
      payout_chain: input.payoutChain,
      telegram: input.telegram || null,
      display_name: input.displayName || null,
      email: input.email,
      terms_version: input.termsVersion || '1.0',
    });
    if (!error) {
      lastError = null;
      break;
    }
    if (error.code === '23505' && error.message?.includes('referral_code')) {
      lastError = error;
      continue;
    }
    lastError = error;
    break;
  }
  if (lastError) {
    logger.error('EPP partner insert failed', { error: lastError.message });
    return { ok: false, error: 'create_failed' };
  }

  // Mark user as EPP
  await supabase.from('users').update({ is_epp: true }).eq('id', userId);

  // Mark invite used
  await supabase
    .from('epp_invites')
    .update({ status: 'used', used_by: userId, used_at: new Date().toISOString() })
    .eq('id', invite.id);

  return { ok: true, referralCode: partnerCode };
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit check — fails closed in production via lib/rate-limit.ts
    const rl = await rateLimit(request, 'auth_wallet', 10);
    if (rl) return rl;

    const { address, message, signature, referralCode, eppOnboard } = await request.json() as {
      address?: string;
      message?: string;
      signature?: string;
      referralCode?: string;
      eppOnboard?: EppOnboardInput;
    };

    if (!address || !message || !signature) {
      return Response.json(
        { code: 'INVALID_REQUEST', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json(
        { code: 'INVALID_ADDRESS', message: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    // Verify nonce is valid and consume it (single-use)
    const siweMessage = new SiweMessage(message);
    const nonceValid = await verifyNonce(siweMessage.nonce);
    if (!nonceValid) {
      return Response.json(
        { code: 'INVALID_NONCE', message: 'Nonce expired or already used' },
        { status: 401 }
      );
    }

    // Verify SIWE signature and domain (EIP-4361 defense-in-depth)
    const expectedDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || request.headers.get('host') || '';
    const { data: siweData } = await siweMessage.verify({ signature, domain: expectedDomain });

    // Verify the recovered address matches
    if (siweData.address.toLowerCase() !== address.toLowerCase()) {
      return Response.json(
        { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' },
        { status: 401 }
      );
    }

    const walletLower = address.toLowerCase();
    const supabase = createServerSupabase();

    // Find or create user
    let { data: user } = await supabase
      .from('users')
      .select('id, primary_wallet, display_name, language, is_epp, referral_code')
      .eq('primary_wallet', walletLower)
      .single();

    let isFirstSignup = false;
    if (!user) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({ primary_wallet: walletLower })
        .select('id, primary_wallet, display_name, language, is_epp, referral_code')
        .single();

      if (error) {
        return Response.json(
          { code: 'INTERNAL_ERROR', message: 'Failed to create account' },
          { status: 500 }
        );
      }
      user = newUser;
      isFirstSignup = true;
    }

    // Assign a personal referral code if the user doesn't already have one.
    // This runs on first signup and also back-fills existing users who
    // connected before this code path existed.
    const personalCode = await ensurePersonalCode(supabase, user!.id, user!.referral_code);
    if (personalCode && personalCode !== user!.referral_code) {
      user!.referral_code = personalCode;
    }

    // On first signup, attach the referrer if one was supplied.
    if (isFirstSignup) {
      await maybeAttachReferrer(supabase, user!.id, walletLower, referralCode);
    }

    // Optional EPP partner creation (used by /epp/onboard). Idempotent —
    // if the user already has an epp_partners row, returns success without
    // creating a duplicate.
    if (eppOnboard) {
      const result = await maybeCreateEppPartner(supabase, user!.id, walletLower, eppOnboard);
      if (!result.ok) {
        return Response.json(
          { code: 'EPP_ONBOARD_FAILED', error: result.error },
          { status: 400 }
        );
      }
      // Refresh user.is_epp so JWT/payload reflect new state
      user!.is_epp = true;
    }

    // Check EPP status
    let eppPartner = null;
    if (user?.is_epp) {
      const { data: partner } = await supabase
        .from('epp_partners')
        .select('referral_code, tier, credited_amount, payout_wallet, payout_chain')
        .eq('user_id', user.id)
        .single();
      eppPartner = partner;
    }

    // Issue JWT
    const token = await new SignJWT({
      sub: user!.id,
      wallet: walletLower,
      isEpp: user!.is_epp,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(getSecret());

    return Response.json({
      token,
      user: {
        id: user!.id,
        wallet: user!.primary_wallet,
        displayName: user!.display_name,
        language: user!.language,
        isEpp: user!.is_epp,
        referralCode: user!.referral_code,
        partner: eppPartner,
      },
    });
  } catch (err) {
    logger.error('Auth wallet route failed', { error: String(err) });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Authentication failed' },
      { status: 500 }
    );
  }
}
