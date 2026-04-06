import { createServerSupabase } from '@/lib/supabase';

/**
 * Health check endpoint for monitoring.
 * Verifies: DB connectivity, sale_config exists, critical env vars present.
 * Returns 200 if all healthy, 503 if any check fails.
 */
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'warn' | 'fail'; detail?: string }> = {};

  // Check critical env vars
  const requiredEnvVars = ['JWT_SECRET', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  checks.env = missingVars.length === 0
    ? { status: 'ok' }
    : { status: 'fail', detail: `Missing: ${missingVars.join(', ')}` };

  // Check Supabase connectivity
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('sale_config')
      .select('stage')
      .single();

    if (error) {
      checks.database = { status: 'fail', detail: error.message };
    } else if (!data) {
      checks.database = { status: 'fail', detail: 'sale_config not found' };
    } else {
      checks.database = { status: 'ok', detail: `stage=${data.stage}` };
    }
  } catch (err) {
    checks.database = { status: 'fail', detail: String(err) };
  }

  // Check contract addresses configured
  const hasContracts = !!process.env.SALE_CONTRACT_ARBITRUM && !!process.env.SALE_CONTRACT_BSC;
  checks.contracts = hasContracts
    ? { status: 'ok' }
    : { status: 'warn', detail: 'Placeholder addresses — contracts not yet deployed' };

  // Check webhook secrets configured
  checks.webhooks = {
    status: (process.env.ALCHEMY_WEBHOOK_SIGNING_KEY && process.env.QUICKNODE_WEBHOOK_SECRET) ? 'ok' : 'fail',
    detail: !process.env.ALCHEMY_WEBHOOK_SIGNING_KEY ? 'Missing ALCHEMY_WEBHOOK_SIGNING_KEY' :
            !process.env.QUICKNODE_WEBHOOK_SECRET ? 'Missing QUICKNODE_WEBHOOK_SECRET' : undefined,
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok' || c.status === 'warn');

  return Response.json(
    { status: allHealthy ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allHealthy ? 200 : 503 }
  );
}
