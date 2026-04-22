'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePartnersList, usePartnerPipeline } from '@/hooks/useAdmin';
import { authFetch } from '@/lib/api/fetch';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';

type Sort = 'credited' | 'network' | 'tier' | 'joined';

interface InviteRow {
  invite_code: string;
  intended_name: string | null;
  intended_email: string | null;
  status: string;
  created_at: string;
  used_at: string | null;
  expires_at: string | null;
  assigned_by: string | null;
  used_by_wallet: string | null;
}

export default function AdminPartnersPage() {
  const qc = useQueryClient();
  const [sort, setSort] = useState<Sort>('credited');
  const [tab, setTab] = useState<'leaderboard' | 'pipeline' | 'invites'>('leaderboard');
  const partners = usePartnersList({ sort });
  const pipeline = usePartnerPipeline();

  const invites = useQuery({
    queryKey: ['admin', 'invites', 'list'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/epp/invites/list?limit=200');
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<{ rows: InviteRow[] }>;
    },
    staleTime: 30_000,
    enabled: tab === 'invites',
  });

  const [inviteCount, setInviteCount] = useState(5);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  async function generateInvites() {
    setInviteBusy(true);
    setInviteErr(null);
    try {
      const res = await authFetch('/api/admin/epp/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: inviteCount }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `epp-invites-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
    } catch (err) {
      setInviteErr(String(err instanceof Error ? err.message : err));
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1 font-display">Partners</h1>
        <p className="text-sm text-t3">
          EPP leaderboard, promotion pipeline, and invite generator.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm w-fit">
        {(['leaderboard', 'pipeline', 'invites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded capitalize ${
              tab === t ? 'bg-card-hover text-t1' : 'text-t3 hover:text-t1'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' && (
        <Card title={`Leaderboard · ${partners.data?.rows.length ?? 0} partners`}>
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-t3">Sort:</span>
            {(['credited', 'network', 'tier', 'joined'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded border px-2 py-0.5 capitalize ${
                  sort === s ? 'border-green text-green' : 'border-border text-t2 hover:text-t1'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {partners.isLoading && <p className="text-xs text-t3">Loading…</p>}
          {partners.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-t3">
                    <th className="pb-2">Wallet</th>
                    <th className="pb-2">Code</th>
                    <th className="pb-2">Tier</th>
                    <th className="pb-2 text-right">Credited</th>
                    <th className="pb-2 text-right">Network</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Contact</th>
                    <th className="pb-2">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.data.rows.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2">
                        <Link
                          href={`/admin/users/${p.user_id}`}
                          className="font-mono text-xs text-ice hover:underline"
                        >
                          {p.wallet.slice(0, 8)}...{p.wallet.slice(-6)}
                        </Link>
                      </td>
                      <td className="py-2 font-mono text-xs text-gold">{p.referral_code}</td>
                      <td className="py-2">
                        <Badge variant="gold" size="sm">{p.tier}</Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums text-t1">{formatUsd(p.credited_amount)}</td>
                      <td className="py-2 text-right tabular-nums text-t2">{formatNum(p.networkSize)}</td>
                      <td className="py-2">
                        {p.status === 'active' ? (
                          <Badge variant="green" size="sm">active</Badge>
                        ) : (
                          <Badge variant="red" size="sm">{p.status}</Badge>
                        )}
                      </td>
                      <td className="py-2 text-xs text-t3">
                        {p.email || '—'}
                        {p.telegram && <div className="text-[11px] text-t4">{p.telegram}</div>}
                      </td>
                      <td className="py-2 text-xs text-t3">{new Date(p.joined_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {partners.data.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-xs text-t3">
                        No partners yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'pipeline' && (
        <Card title="Promotion pipeline — partners closest to next tier">
          {pipeline.isLoading && <p className="text-xs text-t3">Loading…</p>}
          {pipeline.data && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">Wallet</th>
                  <th className="pb-2">Current</th>
                  <th className="pb-2">Next</th>
                  <th className="pb-2 text-right">Credited</th>
                  <th className="pb-2 text-right">To next</th>
                  <th className="pb-2 w-[40%]">Progress</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.data.rows.map((r) => (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="py-2">
                      <Link
                        href={`/admin/users/${r.user_id}`}
                        className="font-mono text-xs text-ice hover:underline"
                      >
                        {r.wallet.slice(0, 8)}...{r.wallet.slice(-6)}
                      </Link>
                    </td>
                    <td className="py-2"><Badge variant="default" size="sm">{r.tier}</Badge></td>
                    <td className="py-2"><Badge variant="gold" size="sm">{r.nextTier ?? '—'}</Badge></td>
                    <td className="py-2 text-right tabular-nums text-t1">{formatUsd(r.credited_amount)}</td>
                    <td className="py-2 text-right tabular-nums text-t2">
                      {r.distanceCents !== null ? formatUsd(r.distanceCents) : '—'}
                    </td>
                    <td className="py-2">
                      {r.progressPct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                            <div
                              className="h-full bg-gold"
                              style={{ width: `${Math.min(100, r.progressPct)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-[11px] tabular-nums text-t3">
                            {r.progressPct.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-t3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {pipeline.data.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-xs text-t3">
                      No partners close to a promotion.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'invites' && (
        <>
          <Card title="Generate invites">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-t3">Count</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={inviteCount}
                  onChange={(e) => setInviteCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-24 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-t1"
                />
              </div>
              <Button variant="primary" size="sm" onClick={generateInvites} loading={inviteBusy}>
                Generate + download CSV
              </Button>
              {inviteErr && <span className="text-xs text-red">{inviteErr}</span>}
            </div>
            <p className="mt-2 text-[11px] text-t4">
              Bulk &gt; 100 uses scripts/generate-epp-invites.mjs. CSV columns: invite_code, status, created_at, url.
            </p>
          </Card>

          <Card title={`Recent invites · ${invites.data?.rows.length ?? 0}`}>
            {invites.isLoading && <p className="text-xs text-t3">Loading…</p>}
            {invites.data && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-t3">
                      <th className="pb-2">Code</th>
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Used by</th>
                      <th className="pb-2">Created</th>
                      <th className="pb-2">Used</th>
                      <th className="pb-2">Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.data.rows.map((r) => (
                      <tr key={r.invite_code} className="border-t border-border">
                        <td className="py-2 font-mono text-xs text-t1">{r.invite_code}</td>
                        <td className="py-2 text-xs text-t2">{r.intended_name || '—'}</td>
                        <td className="py-2">
                          {r.status === 'used' ? (
                            <Badge variant="green" size="sm">used</Badge>
                          ) : (
                            <Badge variant="default" size="sm">{r.status}</Badge>
                          )}
                        </td>
                        <td className="py-2 font-mono text-[11px] text-t3">
                          {r.used_by_wallet ? `${r.used_by_wallet.slice(0, 8)}...${r.used_by_wallet.slice(-6)}` : '—'}
                        </td>
                        <td className="py-2 text-xs text-t3">{new Date(r.created_at).toLocaleDateString()}</td>
                        <td className="py-2 text-xs text-t3">{r.used_at ? new Date(r.used_at).toLocaleDateString() : '—'}</td>
                        <td className="py-2 text-xs text-t3">{r.assigned_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {invites.data && (
            <Card title="Invite funnel">
              <InviteFunnel rows={invites.data.rows} total={formatUsdShort(0)} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function InviteFunnel({ rows }: { rows: InviteRow[]; total: string }) {
  const total = rows.length;
  const used = rows.filter((r) => r.status === 'used').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const conversionPct = total > 0 ? (used / total) * 100 : 0;
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat label="Total" value={formatNum(total)} />
      <Stat label="Pending" value={formatNum(pending)} />
      <Stat label="Onboarded" value={`${formatNum(used)} · ${conversionPct.toFixed(0)}%`} tone="green" />
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' }) {
  return (
    <div className={`rounded border ${tone === 'green' ? 'border-green/30' : 'border-border'} bg-bg p-3`}>
      <p className="text-[10px] uppercase tracking-widest text-t3">{label}</p>
      <p className="mt-1 text-base font-bold text-t1 tabular-nums">{value}</p>
    </div>
  );
}
