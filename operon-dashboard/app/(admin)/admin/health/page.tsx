'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useHealth, useAuditLog } from '@/hooks/useAdmin';
import { authFetch } from '@/lib/api/fetch';
import { formatNum } from '@/lib/format';

export default function AdminHealthPage() {
  const qc = useQueryClient();
  const health = useHealth();
  const [auditQ, setAuditQ] = useState('');
  const audit = useAuditLog({ q: auditQ, limit: 200 });

  const [replayTx, setReplayTx] = useState('');
  const [replayChain, setReplayChain] = useState<'arbitrum' | 'bsc'>('arbitrum');
  const [replayErr, setReplayErr] = useState<string | null>(null);
  const [replayOk, setReplayOk] = useState<string | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);

  async function replay() {
    setReplayBusy(true);
    setReplayErr(null);
    setReplayOk(null);
    try {
      const res = await authFetch('/api/admin/events/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: replayTx.trim(), chain: replayChain }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setReplayOk(JSON.stringify(body));
      qc.invalidateQueries({ queryKey: ['admin', 'health'] });
    } catch (e) {
      setReplayErr(String(e instanceof Error ? e.message : e));
    } finally {
      setReplayBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1 font-display">Health</h1>
        <p className="text-sm text-t3">
          Queues, reconcile cron, and the admin audit log.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthTile
          label="Failed events — pending"
          value={formatNum(health.data?.failedEvents.pending ?? 0)}
          tone={
            (health.data?.failedEvents.pending ?? 0) > 5
              ? 'amber'
              : (health.data?.failedEvents.pending ?? 0) > 0
                ? 'default'
                : 'green'
          }
        />
        <HealthTile
          label="Failed events — retrying"
          value={formatNum(health.data?.failedEvents.retrying ?? 0)}
        />
        <HealthTile
          label="Failed events — abandoned"
          value={formatNum(health.data?.failedEvents.abandoned ?? 0)}
          tone={(health.data?.failedEvents.abandoned ?? 0) > 0 ? 'red' : 'default'}
        />
        <HealthTile
          label="Oldest failed"
          value={
            health.data?.failedEvents.oldest
              ? `${Math.round(
                  (Date.now() - new Date(health.data.failedEvents.oldest).getTime()) / 3_600_000,
                )}h`
              : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Failed events — by kind">
          {health.data && Object.keys(health.data.failedEventKinds).length === 0 ? (
            <p className="text-xs text-t3">None outstanding.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {health.data &&
                Object.entries(health.data.failedEventKinds).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-t2">{k}</span>
                    <span className="tabular-nums text-t1">{v}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <Card title="Referral-code sync queue">
          {health.data ? (
            <ul className="space-y-1 text-sm">
              <Row label="Pending" value={formatNum(health.data.syncQueue.pending)} />
              <Row label="Failed" value={formatNum(health.data.syncQueue.failed)} />
              <Row label="Synced" value={formatNum(health.data.syncQueue.synced)} />
              <Row label="Revoked" value={formatNum(health.data.syncQueue.revoked)} />
            </ul>
          ) : (
            <p className="text-xs text-t3">Loading…</p>
          )}
        </Card>
      </div>

      <Card title="Reconcile cron — last run">
        {health.data ? (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-t3">When</dt>
              <dd className="mt-1 text-t1">
                {health.data.reconcile.lastRunAt
                  ? new Date(health.data.reconcile.lastRunAt).toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-t3">Duration</dt>
              <dd className="mt-1 text-t1 tabular-nums">
                {health.data.reconcile.lastDurationMs != null
                  ? `${health.data.reconcile.lastDurationMs} ms`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-t3">Events found</dt>
              <dd className="mt-1 text-t1 tabular-nums">
                {health.data.reconcile.lastEventsFound ?? '—'}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-t3">Loading…</p>
        )}
      </Card>

      <Card title="Replay a webhook event">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Chain</label>
            <select
              value={replayChain}
              onChange={(e) => setReplayChain(e.target.value as 'arbitrum' | 'bsc')}
              className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-t1"
            >
              <option value="arbitrum">Arbitrum</option>
              <option value="bsc">BSC</option>
            </select>
          </div>
          <div className="flex-1 min-w-[300px]">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Tx hash</label>
            <input
              type="text"
              value={replayTx}
              onChange={(e) => setReplayTx(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs text-t1"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={replay}
            loading={replayBusy}
            disabled={!/^0x[a-fA-F0-9]{64}$/.test(replayTx.trim())}
          >
            Replay
          </Button>
        </div>
        {replayErr && <p className="mt-2 text-xs text-red">{replayErr}</p>}
        {replayOk && <p className="mt-2 font-mono text-[11px] text-t3">{replayOk}</p>}
      </Card>

      <Card title={`Admin audit log · ${audit.data?.rows.length ?? 0}`}>
        <input
          type="text"
          value={auditQ}
          onChange={(e) => setAuditQ(e.target.value)}
          placeholder="Filter: action or target id"
          className="mb-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1 placeholder:text-t4"
        />
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs uppercase tracking-wider text-t3">
                <th className="py-2">When</th>
                <th className="py-2">Actor</th>
                <th className="py-2">Action</th>
                <th className="py-2">Target</th>
                <th className="py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.rows.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2 text-[11px] text-t3">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="py-2 font-mono text-[11px] text-t2">
                    {a.admin_user.slice(0, 6)}…{a.admin_user.slice(-4)}
                  </td>
                  <td className="py-2 font-mono text-xs text-t1">{a.action}</td>
                  <td className="py-2 font-mono text-[11px] text-t3">
                    {a.target_type ? `${a.target_type}/` : ''}{a.target_id || '—'}
                  </td>
                  <td className="py-2 font-mono text-[10px] text-t3 max-w-[360px] truncate">
                    {a.details ? JSON.stringify(a.details) : '—'}
                  </td>
                </tr>
              ))}
              {audit.data?.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-t3">No audit entries match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-t3">{label}</span>
      <span className="tabular-nums text-t1">{value}</span>
    </li>
  );
}

function HealthTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'green' | 'amber' | 'red';
}) {
  const ring =
    tone === 'green'
      ? 'border-green/30'
      : tone === 'amber'
        ? 'border-amber/30'
        : tone === 'red'
          ? 'border-red/30'
          : 'border-border';
  return (
    <div className={`rounded-lg border bg-card p-4 ${ring}`}>
      <p className="text-[10px] uppercase tracking-widest text-t3">{label}</p>
      <p className="mt-1 text-2xl font-bold text-t1 tabular-nums">{value}</p>
    </div>
  );
}
