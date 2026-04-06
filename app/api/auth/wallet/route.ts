import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { SignJWT } from 'jose';
import { SiweMessage } from 'siwe';
import { getSecret } from '@/lib/auth';
import { verifyNonce } from '@/lib/nonce';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiting (only if Upstash env vars are present)
const ratelimit = process.env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, '1 m'),
    })
  : null;

export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    if (ratelimit) {
      const ip = request.headers.get('x-forwarded-for') || 'unknown';
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        return Response.json(
          { code: 'RATE_LIMITED', message: 'Too many requests' },
          { status: 429 }
        );
      }
    }

    const { address, message, signature } = await request.json();

    if (!address || !message || !signature) {
      return Response.json(
        { code: 'INVALID_REQUEST', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate wallet address format
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

    // Verify SIWE signature
    const { data: siweData } = await siweMessage.verify({ signature });

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
      .select('id, primary_wallet, display_name, language, is_epp')
      .eq('primary_wallet', walletLower)
      .single();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({ primary_wallet: walletLower })
        .select('id, primary_wallet, display_name, language, is_epp')
        .single();

      if (error) {
        return Response.json(
          { code: 'INTERNAL_ERROR', message: 'Failed to create account' },
          { status: 500 }
        );
      }
      user = newUser;
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
        partner: eppPartner,
      },
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Authentication failed' },
      { status: 500 }
    );
  }
}
