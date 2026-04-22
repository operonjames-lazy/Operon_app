'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUnpaidCommissions, useMilestones, type UnpaidBatch } from '@/hooks/useAdmin';
import { authFetch } from '@/lib/api/fetch';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';

export default function AdminPayoutsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'unpaid' | 'milestones'>('unpaid');
  const unpaid = useUnpaidCommissions();
  const milestones = useMilestones();

  function exportCsv() {
    if (!unpaid.data) return;
    const lines = ['wallet,payout_wallet,payout_chain,count,total_usd,oldest,row_ids'];
    for (const b of unpaid.data.batches) {
      lines.push(
        [
          b.wallet,
          b.payout_wallet,
          b.payout_chain,
          b.count,
          (b.totalCents / 100).toFixed(2),
          b.oldest,
          b.rows.map((r) => r.id).join('|'),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unpaid-commissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1 font-display">Payouts</h1>
          <p className="text-sm text-t3">
            Backend records, never sends. Sweep on-chain separately, then mark rows paid here.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!unpaid.data}>
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile
          label="Unpaid total"
          value={unpaid.data ? formatUsd(unpaid.data.totalCents) : '—'}
          sub={unpaid.data ? `${unpaid.data.batches.length} recipients · ${unpaid.data.totalCount} rows` : ''}
          tone="amber"
        />
        <StatTile
          label="Oldest unpaid"
          value={unpaid.data && unpaid.data.batches.length > 0
            ? `${Math.round((Date.now() - new Date(unpaid.data.batches.reduce((a, b) => a.oldest < b.oldest ? a : b).oldest).getTime()) / 86_400_000)}d`
            : '—'}
          sub="since oldest accrual"
        />
        <StatTile
          label="Milestone bonuses owed"
          value={milestones.data
            ? formatUsd(milestones.data.rows.reduce((a, r) => a + (r.lastAchievedBonus ?? 0), 0))
            : '—'}
          sub={milestones.data ? `${milestones.data.rows.length} partners` : ''}
          tone="gold"
        />
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm w-fit">
        {(['unpaid', 'milestones'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded capitalize ${
              tab === t ? 'bg-card-hover text-t1' : 'text-t3 hover:text-t1'
            }`}
          >
            {t === 'unpaid' ? 'Unpaid commissions' : 'Milestone bonuses'}
          </button>
        ))}
      </div>

      {tab === 'unpaid' && (
        <div className="space-y-3">
          {unpaid.isLoading && <p className="text-xs text-t3">Loading…</p>}
          {unpaid.data && unpaid.data.batches.length === 0 && (
            <Card>
              <p className="text-sm text-t3">No unpaid commissions. You're caught up.</p>
            </Card>
          )}
          {unpaid.data?.batches.map((b) => (
            <PayoutBatch
              key={b.referrer_id}
              batch={b}
              onPaid={() => {
                qc.invalidateQueries({ queryKey: ['admin', 'payouts'] });
                qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
              }}
            />
          ))}
        </div>
      )}

      {tab === 'milestones' && (
        <Card title="Milestone bonuses derived from credited amount (threshold → bonus)">
          <p className="mb-3 text-[11px] text-t4">
            No persistent state yet — this shows who has crossed a bonus threshold. Track paid-status in your off-platform payout sheet; Operon does not mark milestone bonuses as paid.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">Wallet</th>
                  <th className="pb-2">Tier</th>
                  <th className="pb-2 text-right">Credited</th>
                  <th className="pb-2 text-right">Threshold</th>
                  <th className="pb-2 text-right">Bonus earned</th>
                </tr>
              </thead>
              <tbody>
                {milestones.data?.rows.map((r) => (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="py-2">
                      <Link
                        href={`/admin/users/${r.user_id}`}
                        className="font-mono text-xs text-ice hover:underline"
                      >
                        {r.wallet.slice(0, 8)}...{r.wallet.slice(-6)}
                      </Link>
                    </td>
                    <td className="py-2"><Badge variant="gold" size="sm">{r.tier}</Badge></td>
                    <td className="py-2 text-right tabular-nums text-t1">{formatUsd(r.credited_amount)}</td>
                    <td className="py-2 text-right tabular-nums text-t2">
                      {r.lastAchievedThreshold !== null ? formatUsd(r.lastAchievedThreshold) : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gold">
                      {r.lastAchievedBonus !== null ? formatUsd(r.lastAchievedBonus) : '—'}
                    </td>
                  </tr>
                ))}
                {milestones.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-t3">
                      No partner has crossed a milestone threshold yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function PayoutBatch({ batch, onPaid }: { batch: UnpaidBatch; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [fromWallet, setFromWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function markPaid() {
    setBusy(true);
    setErr(null);
    try {
      const res = await authFetch('/api/admin/payouts/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralPurchaseIds: batch.rows.map((r) => r.id),
          txHash: txHash.trim(),
          paidFromWallet: fromWallet.trim().toLowerCase(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onPaid();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  const oldestDays = Math.round((Date.now() - new Date(batch.oldest).getTime()) / 86_400_000);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between p-4">
        <div className="flex-1 min-w-0">
          <Link
            href={`/admin/users/${batch.referrer_id}`}
            className="font-mono text-xs text-ice hover:underline"
          >
            {batch.wallet.slice(0, 10)}...{batch.wallet.slice(-8)}
          </Link>
          <p className="mt-1 text-xs text-t3">
            Pay to <span className="font-mono text-t2">{batch.payout_wallet.slice(0, 8)}...{batch.payout_wallet.slice(-6)}</span>
            {' · '}{batch.payout_chain}
            {' · '}{batch.count} rows · oldest {oldestDays}d ago
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-lg font-bold text-t1 tabular-nums">{formatUsd(batch.totalCents)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setOpen((p) => !p)}>
            {open ? 'Close' : 'Mark paid'}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Tx hash</label>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-t1"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Paid from wallet</label>
              <input
                type="text"
                value={fromWallet}
                onChange={(e) => setFromWallet(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-t1"
              />
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-t3">{batch.count} rows ({formatNum(batch.count)})</summary>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {batch.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1 font-mono text-[10px] text-t3">{r.purchase_tx.slice(0, 10)}…</td>
                    <td className="py-1">L{r.level}</td>
                    <td className="py-1 text-right tabular-nums">{formatUsdShort(r.commission_usd)}</td>
                    <td className="py-1 text-t3">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {err && <p className="text-xs text-red">{err}</p>}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={markPaid}
              disabled={
                !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim()) ||
                !/^0x[a-fA-F0-9]{40}$/.test(fromWallet.trim())
              }
            >
              Confirm — {formatUsd(batch.totalCents)} sent
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'amber' | 'gold';
}) {
  const ring =
    tone === 'amber' ? 'border-amber/30' : tone === 'gold' ? 'border-gold/25' : 'border-border';
  return (
    <div className={`rounded-lg border bg-card p-4 ${ring}`}>
      <p className="text-[10px] uppercase tracking-widest text-t3">{label}</p>
      <p className="mt-1 text-2xl font-bold text-t1 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-t3">{sub}</p>}
    </div>
  );
}
