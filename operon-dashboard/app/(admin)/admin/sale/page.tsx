'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/api/fetch';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';

interface TierRow {
  tier: number;
  price_usd: number;
  total_supply: number;
  total_sold: number;
  is_active: boolean;
  revenue_cents: number;
  contract_tier_id: number;
}

interface BalanceRow {
  chain: string;
  token: string;
  cents: number | null;
  error?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export default function AdminSalePage() {
  const qc = useQueryClient();
  const tiersQ = useQuery({
    queryKey: ['admin', 'sale', 'tiers'],
    queryFn: () => fetchJson<{ rows: TierRow[] }>('/api/admin/sale/tiers'),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const balanceQ = useQuery({
    queryKey: ['admin', 'sale', 'balance'],
    queryFn: () => fetchJson<{ balances: BalanceRow[] }>('/api/admin/sale/balance'),
    staleTime: 60_000,
  });
  const overviewQ = useQuery({
    queryKey: ['admin', 'overview', 30],
    queryFn: () => fetchJson<{ stats: { saleStage: string } }>('/api/admin/stats/overview?days=30'),
    staleTime: 15_000,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  async function postAction(key: string, path: string, body: unknown) {
    setBusy(key);
    setToast(null);
    try {
      const res = await authFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setToast({ kind: 'ok', msg: `OK${res.status === 207 ? ' (mixed result)' : ''}` });
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      setToast({ kind: 'err', msg: String(err instanceof Error ? err.message : err) });
    } finally {
      setBusy(null);
    }
  }

  const stage = overviewQ.data?.stats.saleStage ?? '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1 font-display">Sale controls</h1>
        <p className="text-sm text-t3">Pause, promote tiers, sweep treasury. All actions audit-logged.</p>
      </div>

      {toast && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.kind === 'ok' ? 'border-green/30 bg-green/10 text-green' : 'border-red/30 bg-red/10 text-red'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Sale stage */}
      <Card title={`Sale stage — ${stage}`}>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            size="sm"
            loading={busy === 'pause-arb'}
            onClick={() => postAction('pause-arb', '/api/admin/sale/pause', { chain: 'arbitrum' })}
          >
            Pause Arb
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy === 'pause-bsc'}
            onClick={() => postAction('pause-bsc', '/api/admin/sale/pause', { chain: 'bsc' })}
          >
            Pause BSC
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy === 'pause-both'}
            onClick={() => postAction('pause-both', '/api/admin/sale/pause', { chain: 'both' })}
          >
            Pause both
          </Button>
          <div className="w-2" />
          <Button
            variant="primary"
            size="sm"
            loading={busy === 'unpause-arb'}
            onClick={() => postAction('unpause-arb', '/api/admin/sale/unpause', { chain: 'arbitrum' })}
          >
            Unpause Arb
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy === 'unpause-bsc'}
            onClick={() => postAction('unpause-bsc', '/api/admin/sale/unpause', { chain: 'bsc' })}
          >
            Unpause BSC
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy === 'unpause-both'}
            onClick={() => postAction('unpause-both', '/api/admin/sale/unpause', { chain: 'both' })}
          >
            Unpause both
          </Button>
        </div>
      </Card>

      {/* Withdraw */}
      <WithdrawCard
        balances={balanceQ.data?.balances ?? []}
        busy={busy}
        onSubmit={(body) => postAction('withdraw', '/api/admin/sale/withdraw', body)}
      />

      {/* Tiers */}
      <Card title="Tiers">
        {tiersQ.isLoading && <p className="text-xs text-t3">Loading…</p>}
        {tiersQ.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">#</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Sold / Supply</th>
                  <th className="pb-2 text-right">Fill</th>
                  <th className="pb-2 text-right">Revenue</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Contract ID</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiersQ.data.rows.map((t) => {
                  const pct = t.total_supply > 0 ? (t.total_sold / t.total_supply) * 100 : 0;
                  return (
                    <tr key={t.tier} className="border-t border-border">
                      <td className="py-2 text-t1 font-semibold">T{t.tier}</td>
                      <td className="py-2 text-right tabular-nums text-t1">{formatUsd(t.price_usd)}</td>
                      <td className="py-2 text-right tabular-nums text-t2">
                        {formatNum(t.total_sold)} / {formatNum(t.total_supply)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-t3">{pct.toFixed(1)}%</td>
                      <td className="py-2 text-right tabular-nums text-t2">{formatUsdShort(t.revenue_cents)}</td>
                      <td className="py-2">
                        {t.is_active ? (
                          <Badge variant="green" size="sm">active</Badge>
                        ) : t.total_sold >= t.total_supply ? (
                          <Badge variant="default" size="sm">sold out</Badge>
                        ) : (
                          <Badge variant="default" size="sm">inactive</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-t3">{t.contract_tier_id}</td>
                      <td className="py-2 text-right">
                        <TierActions
                          tier={t}
                          busy={busy}
                          onAction={(chain, active) =>
                            postAction(
                              `tier-${t.tier}-${chain}-${active}`,
                              '/api/admin/sale/tier-active',
                              { chain, tierId: t.contract_tier_id, active },
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function TierActions({
  tier,
  busy,
  onAction,
}: {
  tier: TierRow;
  busy: string | null;
  onAction: (chain: 'arbitrum' | 'bsc', active: boolean) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      {(['arbitrum', 'bsc'] as const).map((chain) => (
        <button
          key={chain}
          disabled={!!busy}
          onClick={() => onAction(chain, !tier.is_active)}
          className="rounded border border-border bg-card px-2 py-1 text-[11px] text-t2 hover:bg-card-hover disabled:opacity-50"
        >
          {tier.is_active ? 'Deactivate' : 'Activate'} {chain === 'arbitrum' ? 'Arb' : 'BSC'}
        </button>
      ))}
    </div>
  );
}

function WithdrawCard({
  balances,
  busy,
  onSubmit,
}: {
  balances: BalanceRow[];
  busy: string | null;
  onSubmit: (body: { chain: string; token: string; to: string }) => void;
}) {
  const [chain, setChain] = useState<'arbitrum' | 'bsc'>('arbitrum');
  const [token, setToken] = useState<'USDC' | 'USDT'>('USDC');
  const [to, setTo] = useState('');

  const selected = balances.find((b) => b.chain === chain && b.token === token);

  return (
    <Card title="Withdraw sale proceeds">
      <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {balances.map((b) => (
          <div key={`${b.chain}-${b.token}`} className="rounded border border-border bg-bg p-2">
            <p className="uppercase tracking-widest text-t3">
              {b.chain} · {b.token}
            </p>
            <p className="mt-1 font-bold tabular-nums text-t1">
              {b.cents === null ? (
                <span className="text-red">{b.error || 'n/a'}</span>
              ) : (
                formatUsd(b.cents)
              )}
            </p>
          </div>
        ))}
        {balances.length === 0 && (
          <p className="text-t3 col-span-full">No token addresses configured.</p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Chain</label>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value as 'arbitrum' | 'bsc')}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-t1"
          >
            <option value="arbitrum">Arbitrum</option>
            <option value="bsc">BSC</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Token</label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value as 'USDC' | 'USDT')}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-t1"
          >
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
          </select>
        </div>
        <div className="flex-1 min-w-[240px]">
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">To (treasury)</label>
          <input
            type="text"
            placeholder="0x..."
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-t1 placeholder:text-t4"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={busy === 'withdraw'}
          disabled={!/^0x[a-fA-F0-9]{40}$/.test(to)}
          onClick={() => onSubmit({ chain, token, to })}
        >
          Sweep {selected && selected.cents !== null ? formatUsdShort(selected.cents) : ''}
        </Button>
      </div>
    </Card>
  );
}
