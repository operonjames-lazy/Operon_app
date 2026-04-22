import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 req/min/IP to prevent code enumeration
    const rateLimited = await rateLimit(request, 'epp-validate', 10);
    if (rateLimited) return rateLimited;

    const { code } = await request.json();

    if (!code || !/^EPP-[A-Z0-9]{4}$/.test(code)) {
      return Response.json({ valid: false, reason: 'not_found' });
    }

    const supabase = createServerSupabase();

    const { data: invite } = await supabase
      .from('epp_invites')
      .select('invite_code, status, expires_at')
      .eq('invite_code', code)
      .single();

    if (!invite) {
      return Response.json({ valid: false, reason: 'not_found' });
    }

    if (invite.status === 'used') {
      return Response.json({ valid: false, reason: 'used' });
    }

    if (invite.status === 'expired' || (invite.expires_at && new Date(invite.expires_at) < new Date())) {
      return Response.json({ valid: false, reason: 'expired' });
    }

    const expiresIn = invite.expires_at
      ? Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return Response.json({ valid: true, expires_in_days: expiresIn });
  } catch {
    return Response.json(
      { error: 'server_error' },
      { status: 500 }
    );
  }
}
