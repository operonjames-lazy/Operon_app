'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUserDetail } from '@/hooks/useAdmin';
import { formatUsd, formatNum } from '@/lib/format';
import { authFetch } from '@/lib/api/fetch';

const EPP_TIERS = ['affiliate', 'partner', 'senior', 'regional', 'market', 'founding'];
const PARTNER_STATUSES = ['active', 'suspended', 'terminated'] as const;
type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError, refetch } = useUserDetail(id);
  const queryClient = useQueryClient();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTier, setOverrideTier] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideErr, setOverrideErr] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<PartnerStatus>('suspended');
  const [statusReason, setStatusReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusErr, setStatusErr] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-sm text-t3">Loading…</div>;
  }
  if (isError || !data) {
    return <div className="text-sm text-red">User not found.</div>;
  }

  async function submitOverride() {
    if (!data?.user.id || !overrideTier || !overrideReason.trim()) return;
    setOverrideBusy(true);
    setOverrideErr(null);
    try {
      const res = await authFetch('/api/admin/partners/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, newTier: overrideTier, reason: overrideReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setOverrideOpen(false);
      setOverrideTier('');
      setOverrideReason('');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    } catch (err) {
      setOverrideErr(String(err instanceof Error ? err.message : err));
    } finally {
      setOverrideBusy(false);
    }
  }

  async function submitStatus() {
    if (!data?.user.id || !statusReason.trim()) return;
    setStatusBusy(true);
    setStatusErr(null);
    try {
      const res = await authFetch('/api/admin/partners/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, status: statusTarget, reason: statusReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatusOpen(false);
      setStatusReason('');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    } catch (err) {
      setStatusErr(String(err instanceof Error ? err.message : err));
    } finally {
      setStatusBusy(false);
    }
  }

  const {
    user,
    partner,
    referredBy,
    purchases,
    purchaseCount,
    referralsMade,
    referralsMadeCount,
    commissions,
    auditActions,
  } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/users" className="text-xs text-ice hover:underline">
            ← Users
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-t1">
            {user.display_name || 'User'}
          </h1>
          <p className="font-mono text-xs text-t3">{user.primary_wallet}</p>
          <div className="mt-2 flex items-center gap-2">
            {partner ? (
              <Badge variant="gold">{partner.tier}</Badge>
            ) : (
              <Badge variant="default">community</Badge>
            )}
            {user.language && <Badge variant="default" size="sm">{user.language}</Badge>}
            {partner?.status && partner.status !== 'active' && (
              <Badge variant="red" size="sm">{partner.status}</Badge>
            )}
          </div>
        </div>
        {partner && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOverrideOpen((p) => !p)}>
              Override tier
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStatusTarget(partner.status === 'active' ? 'suspended' : 'active');
                setStatusOpen((p) => !p);
              }}
            >
              Change status
            </Button>
          </div>
        )}
      </div>

      {overrideOpen && partner && (
        <Card title="Override EPP tier">
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-t3">New tier</label>
              <select
                value={overrideTier}
                onChange={(e) => setOverrideTier(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1"
              >
                <option value="">Select tier…</option>
                {EPP_TIERS.map((t) => (
                  <option key={t} value={t} disabled={t === partner.tier}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-t3">Reason (required — goes to audit log)</label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="e.g. Confirmed off-platform referrals with partner"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1 placeholder:text-t4"
              />
            </div>
            {overrideErr && <p className="text-xs text-red">{overrideErr}</p>}
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={submitOverride}
                loading={overrideBusy}
                disabled={!overrideTier || !overrideReason.trim()}
              >
                Apply override
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOverrideOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {statusOpen && partner && (
        <Card title="Change partner status">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-t3">
              Current status: <span className="text-t1">{partner.status}</span>.{' '}
              <span className="text-t4">
                Suspended = commission earning pauses on future purchases; history preserved. Terminated is one-way.
              </span>
            </p>
            <div>
              <label className="mb-1 block text-xs text-t3">New status</label>
              <select
                value={statusTarget}
                onChange={(e) => setStatusTarget(e.target.value as PartnerStatus)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1"
              >
                {PARTNER_STATUSES.map((s) => (
                  <option key={s} value={s} disabled={s === partner.status}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-t3">Reason (required — goes to audit log)</label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={3}
                placeholder="e.g. Violated T&Cs § 4.2 — terms-breach ticket #123"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1 placeholder:text-t4"
              />
            </div>
            {statusErr && <p className="text-xs text-red">{statusErr}</p>}
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={submitStatus}
                loading={statusBusy}
                disabled={statusTarget === partner.status || statusReason.trim().length < 3}
              >
                Apply status
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStatusOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Identity + origin */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Identity">
          <dl className="space-y-2 text-sm">
            <KV label="User ID" value={<span className="font-mono text-xs">{user.id}</span>} />
            <KV label="Email" value={user.email || '—'} />
            <KV label="Display name" value={user.display_name || '—'} />
            <KV label="Payout chain" value={user.payout_chain || '—'} />
            <KV label="Language" value={user.language || '—'} />
            <KV label="Joined" value={new Date(user.created_at).toLocaleString()} />
            <KV label="Personal code" value={<span className="font-mono">{user.referral_code || '—'}</span>} />
          </dl>
        </Card>
        <Card title={partner ? 'EPP partner' : 'Referred by'}>
          {partner ? (
            <dl className="space-y-2 text-sm">
              <KV label="EPP code" value={<span className="font-mono text-gold">{partner.referral_code}</span>} />
              <KV label="Tier" value={partner.tier} />
              <KV label="Credited" value={formatUsd(partner.credited_amount)} />
              <KV label="Payout wallet" value={<span className="font-mono text-xs">{partner.payout_wallet}</span>} />
              <KV label="Payout chain" value={partner.payout_chain} />
              <KV label="Telegram" value={partner.telegram || '—'} />
              <KV label="EPP email" value={partner.email || '—'} />
              <KV label="Status" value={partner.status} />
              <KV label="Onboarded" value={new Date(partner.created_at).toLocaleString()} />
            </dl>
          ) : referredBy ? (
            <dl className="space-y-2 text-sm">
              <KV label="Upline wallet" value={
                <Link href={`/admin/users/${referredBy.id}`} className="font-mono text-xs text-ice hover:underline">
                  {referredBy.wallet}
                </Link>
              } />
              <KV label="Code used" value={<span className="font-mono">{referredBy.code}</span>} />
              <KV label="Level" value={`L${referredBy.level}`} />
            </dl>
          ) : (
            <p className="text-xs text-t3">No upline. This user came in directly.</p>
          )}
        </Card>
      </div>

      {/* Purchases */}
      <Card title={`Purchases · ${formatNum(purchaseCount)}`}>
        {purchases.length === 0 ? (
          <p className="text-xs text-t3">No purchases.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">When</th>
                  <th className="pb-2">Chain</th>
                  <th className="pb-2">Tier</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Discount</th>
                  <th className="pb-2">Code</th>
                  <th className="pb-2">Tx</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 text-xs text-t3">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="py-2 text-xs">{p.chain}</td>
                    <td className="py-2 text-xs">T{p.tier}</td>
                    <td className="py-2 text-right tabular-nums text-t1">{p.quantity}</td>
                    <td className="py-2 text-right tabular-nums text-t1">{formatUsd(p.amount_usd)}</td>
                    <td className="py-2 text-right tabular-nums text-t3">
                      {p.discount_bps > 0 ? `${(p.discount_bps / 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 font-mono text-xs text-t2">{p.code_used || '—'}</td>
                    <td className="py-2 font-mono text-[10px] text-t3">{p.tx_hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Commissions */}
      <Card title={`Commissions — ${formatUsd(commissions.totalCents)} lifetime`}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label="Total earned" value={formatUsd(commissions.totalCents)} />
          <Stat label="Paid" value={formatUsd(commissions.paidCents)} />
          <Stat
            label="Unpaid"
            value={formatUsd(commissions.unpaidCents)}
            tone={commissions.unpaidCents > 0 ? 'amber' : 'default'}
          />
        </div>
        {commissions.recent.length === 0 ? (
          <p className="text-xs text-t3">No commissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">When</th>
                  <th className="pb-2">Level</th>
                  <th className="pb-2 text-right">Commission</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Purchase tx</th>
                </tr>
              </thead>
              <tbody>
                {commissions.recent.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 text-xs text-t3">{new Date(c.created_at).toLocaleString()}</td>
                    <td className="py-2 text-xs">L{c.level}</td>
                    <td className="py-2 text-right tabular-nums text-t1">{formatUsd(c.commission_usd)}</td>
                    <td className="py-2">
                      {c.paid_at ? (
                        <Badge variant="green" size="sm">paid</Badge>
                      ) : (
                        <Badge variant="amber" size="sm">unpaid</Badge>
                      )}
                    </td>
                    <td className="py-2 font-mono text-[10px] text-t3">{c.purchase_tx.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Network */}
      <Card title={`Referrals made · ${formatNum(referralsMadeCount)}`}>
        {referralsMade.length === 0 ? (
          <p className="text-xs text-t3">No downline yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">When</th>
                  <th className="pb-2">Level</th>
                  <th className="pb-2">Code used</th>
                  <th className="pb-2">Downline wallet</th>
                </tr>
              </thead>
              <tbody>
                {referralsMade.slice(0, 50).map((r) => (
                  <tr key={`${r.referred_wallet}-${r.created_at}`} className="border-t border-border">
                    <td className="py-2 text-xs text-t3">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 text-xs">L{r.level}</td>
                    <td className="py-2 font-mono text-xs text-t2">{r.code_used}</td>
                    <td className="py-2 font-mono text-xs text-t2">{r.referred_wallet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {referralsMadeCount > 50 && (
              <p className="mt-2 text-[11px] text-t4">Showing first 50 of {formatNum(referralsMadeCount)}.</p>
            )}
          </div>
        )}
      </Card>

      {/* Audit on this user */}
      {auditActions.length > 0 && (
        <Card title={`Admin actions on this user · ${auditActions.length}`}>
          <ul className="space-y-2 text-sm">
            {auditActions.map((a, i) => (
              <li key={i} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-t2">{a.action}</span>
                  <span className="text-[11px] text-t3">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.details && (
                  <pre className="mt-1 overflow-x-auto text-[11px] text-t3">{JSON.stringify(a.details, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-t3">{label}</dt>
      <dd className="text-right text-sm text-t1">{value}</dd>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'amber' }) {
  return (
    <div className={`rounded border ${tone === 'amber' ? 'border-amber/30' : 'border-border'} bg-bg p-3`}>
      <p className="text-[10px] uppercase tracking-widest text-t3">{label}</p>
      <p className="mt-1 text-base font-bold text-t1 tabular-nums">{value}</p>
    </div>
  );
}
