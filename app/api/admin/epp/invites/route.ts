import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction, generateInviteCode } from '@/lib/admin';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/epp/invites
 * Body: { count: number (1-100) }
 * Response: CSV of generated codes (one per line)
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { count?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return Response.json({ error: 'invalid_count', field: 'count' }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const generated: string[] = [];

  for (let i = 0; i < count; i++) {
    // Retry a few times on rare collisions with the UNIQUE constraint.
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = generateInviteCode();
      const { error } = await supabase.from('epp_invites').insert({
        invite_code: code,
        status: 'pending',
        created_by: admin.wallet,
      });
      if (!error) {
        generated.push(code);
        inserted = true;
      } else if (error.code !== '23505') {
        logger.error('epp_invites insert failed', { error: error.message });
        return Response.json({ error: 'db_error' }, { status: 500 });
      }
    }
    if (!inserted) {
      return Response.json({ error: 'collision_limit' }, { status: 500 });
    }
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'epp_invites_generated',
      details: { count, codes: generated },
    });
  } catch (err) {
    logger.error('Failed to write admin audit log', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const csv = 'invite_code\n' + generated.join('\n') + '\n';
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="epp_invites_${Date.now()}.csv"`,
    },
  });
}
