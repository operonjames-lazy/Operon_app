import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Health check endpoint for monitoring.
 * Verifies: DB connectivity, sale_config exists, critical env vars present.
 * Returns 200 if all healthy, 503 if any check fails.
 *
 * Rate-limited because the response touches the DB (one SELECT on sale_config)
 * and the route is unauthenticated — without a limit, any IP can amplify DB
 * load by hitting it in a loop.
 */
export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, 'health', 60);
  if (limited) return limited;

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

  // Check contract addresses configured. On testnet (`NEXT_PUBLIC_NETWORK_MODE=testnet`)
  // missing addresses are a `warn` — pre-launch state where the deploy hasn't happened.
  // On mainnet, missing = `fail`: it means the env was misconfigured (e.g. somebody
  // dropped SALE_CONTRACT_ARBITRUM from Vercel) and the sale path will not work.
  const hasContracts = !!process.env.SALE_CONTRACT_ARBITRUM && !!process.env.SALE_CONTRACT_BSC;
  const isMainnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'mainnet';
  checks.contracts = hasContracts
    ? { status: 'ok' }
    : {
        status: isMainnet ? 'fail' : 'warn',
        detail: isMainnet
          ? 'Missing SALE_CONTRACT_ARBITRUM/BSC on mainnet — sale path broken'
          : 'Placeholder addresses — contracts not yet deployed',
      };

  // Check webhook secrets configured. In non-production (local tester
  // running `pnpm dev`), Alchemy/QuickNode webhooks are not used — the
  // dev-indexer replaces them — so missing secrets are `warn` rather than
  // `fail`. In production they are load-bearing, so missing = fail.
  const isProd = process.env.NODE_ENV === 'production';
  const webhookSeverity: 'fail' | 'warn' = isProd ? 'fail' : 'warn';
  const hasWebhookSecrets = !!process.env.ALCHEMY_WEBHOOK_SIGNING_KEY && !!process.env.QUICKNODE_WEBHOOK_SECRET;
  checks.webhooks = {
    status: hasWebhookSecrets ? 'ok' : webhookSeverity,
    detail: !process.env.ALCHEMY_WEBHOOK_SIGNING_KEY ? 'Missing ALCHEMY_WEBHOOK_SIGNING_KEY' :
            !process.env.QUICKNODE_WEBHOOK_SECRET ? 'Missing QUICKNODE_WEBHOOK_SECRET' : undefined,
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok' || c.status === 'warn');

  return Response.json(
    { status: allHealthy ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allHealthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
