'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MetricTile } from '@/components/admin/metric-tile';
import { Sparkbars } from '@/components/admin/sparkbars';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAdminOverview } from '@/hooks/useAdmin';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';

export default function AdminOverviewPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useAdminOverview(days);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-border bg-card" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return <div className="text-sm text-red">Failed to load overview.</div>;
  }

  const { stats, daily } = data;
  const attrTotal =
    stats.attribution.noCodeCents + stats.attribution.communityCents + stats.attribution.eppCents;
  const pct = (n: number) => (attrTotal > 0 ? (n / attrTotal) * 100 : 0);

  const saleStageTone =
    stats.saleStage === 'active' ? 'green' : stats.saleStage === 'paused' ? 'amber' : 'red';

  return (
    <div className="space-y-6">
      {/* Stage banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-t3">Sale stage</span>
          <Badge variant={saleStageTone as 'green' | 'amber' | 'red'}>{stats.saleStage}</Badge>
          <Link href="/admin/sale" className="text-xs text-ice hover:underline">
            Controls →
          </Link>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 rounded ${
                days === d ? 'bg-card-hover text-t1' : 'text-t3 hover:text-t1'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Revenue · Today"
          value={formatUsdShort(stats.revenue.today)}
          sub="last 24h"
        />
        <MetricTile
          label="Revenue · 7d"
          value={formatUsdShort(stats.revenue.last7d)}
        />
        <MetricTile
          label="Revenue · 30d"
          value={formatUsdShort(stats.revenue.last30d)}
        />
        <MetricTile
          label="Revenue · Lifetime"
          value={formatUsdShort(stats.revenue.lifetime)}
          tone="green"
        />
        <MetricTile
          label="Nodes sold"
          value={`${formatNum(stats.nodes.sold)} / ${formatNum(stats.nodes.totalSupply)}`}
          sub={`${stats.nodes.sellthroughPct.toFixed(1)}% sellthrough`}
        />
        <MetricTile
          label="Commissions unpaid"
          value={formatUsdShort(stats.commissions.unpaidCents)}
          sub={`${stats.commissions.unpaidCount} rows`}
          tone={stats.commissions.unpaidCents > 0 ? 'amber' : 'default'}
        />
        <MetricTile
          label="Partners"
          value={formatNum(stats.partners.total)}
          sub={Object.entries(stats.partners.byTier)
            .map(([t, c]) => `${t}:${c}`)
            .join(' · ')}
        />
        <MetricTile
          label="Users"
          value={formatNum(stats.users.total)}
          sub={`${stats.users.withPurchases} have purchased`}
        />
      </div>

      {/* Referral attribution — headline feature */}
      <Card title="Referral attribution">
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <p className="text-xs text-t3">
              How {formatUsd(attrTotal)} of lifetime revenue came in.
            </p>
            <p className="text-xs text-t3">
              {stats.attribution.noCodeCount + stats.attribution.communityCount + stats.attribution.eppCount} purchases
            </p>
          </div>
          <div className="flex h-10 w-full overflow-hidden rounded-md border border-border">
            <div
              className="bg-t4 transition-all"
              style={{ width: `${pct(stats.attribution.noCodeCents)}%` }}
              title={`No code: ${formatUsd(stats.attribution.noCodeCents)}`}
            />
            <div
              className="bg-green/70"
              style={{ width: `${pct(stats.attribution.communityCents)}%` }}
              title={`Community: ${formatUsd(stats.attribution.communityCents)}`}
            />
            <div
              className="bg-gold"
              style={{ width: `${pct(stats.attribution.eppCents)}%` }}
              title={`EPP: ${formatUsd(stats.attribution.eppCents)}`}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <AttributionRow
              label="No code"
              dotClass="bg-t4"
              cents={stats.attribution.noCodeCents}
              count={stats.attribution.noCodeCount}
              pct={pct(stats.attribution.noCodeCents)}
            />
            <AttributionRow
              label="Community (10%)"
              dotClass="bg-green/70"
              cents={stats.attribution.communityCents}
              count={stats.attribution.communityCount}
              pct={pct(stats.attribution.communityCents)}
            />
            <AttributionRow
              label="EPP (15%)"
              dotClass="bg-gold"
              cents={stats.attribution.eppCents}
              count={stats.attribution.eppCount}
              pct={pct(stats.attribution.eppCents)}
            />
          </div>
        </div>
      </Card>

      {/* Daily revenue sparkbars */}
      <Card title={`Daily revenue — last ${days} days`}>
        <Sparkbars data={daily} />
      </Card>

      {/* Chain split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Revenue by chain">
          <div className="space-y-2 text-sm">
            <Row label="Arbitrum" value={formatUsd(stats.revenue.byChain.arbitrum)} />
            <Row label="BNB Chain" value={formatUsd(stats.revenue.byChain.bsc)} />
            <Row
              label="Ratio"
              value={
                stats.revenue.byChain.arbitrum + stats.revenue.byChain.bsc > 0
                  ? `${Math.round(
                      (stats.revenue.byChain.arbitrum /
                        (stats.revenue.byChain.arbitrum + stats.revenue.byChain.bsc)) *
                        100,
                    )}% Arb · ${Math.round(
                      (stats.revenue.byChain.bsc /
                        (stats.revenue.byChain.arbitrum + stats.revenue.byChain.bsc)) *
                        100,
                    )}% BSC`
                  : '—'
              }
            />
          </div>
        </Card>
        <Card title="Partner tier breakdown">
          <div className="space-y-2 text-sm">
            {['founding', 'market', 'regional', 'senior', 'partner', 'affiliate'].map((t) => (
              <Row
                key={t}
                label={t.charAt(0).toUpperCase() + t.slice(1)}
                value={formatNum(stats.partners.byTier[t] || 0)}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-t3">{label}</span>
      <span className="font-medium text-t1 tabular-nums">{value}</span>
    </div>
  );
}

function AttributionRow({
  label,
  dotClass,
  cents,
  count,
  pct,
}: {
  label: string;
  dotClass: string;
  cents: number;
  count: number;
  pct: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-xs text-t3">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold text-t1 tabular-nums">{formatUsdShort(cents)}</p>
      <p className="text-[11px] text-t3">
        {pct.toFixed(1)}% · {count} purchases
      </p>
    </div>
  );
}
