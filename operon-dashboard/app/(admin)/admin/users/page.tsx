'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUserSearch } from '@/hooks/useAdmin';

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [committed, setCommitted] = useState('');
  const { data, isLoading, isError } = useUserSearch(committed);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setCommitted(q.trim());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1 font-display">Users</h1>
        <p className="text-sm text-t3">Search by wallet, user ID, email, display name, referral code, or Telegram handle.</p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          autoFocus
          type="text"
          placeholder="0x... / uuid / email / @tg / OPRN-XXXX"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-t1 placeholder:text-t4 focus:border-green focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-green px-5 py-2 text-sm font-semibold text-black hover:bg-green-hover"
        >
          Search
        </button>
      </form>

      {!committed && (
        <p className="text-xs text-t3">Type at least 2 characters and press Enter.</p>
      )}
      {committed && isLoading && <p className="text-xs text-t3">Searching...</p>}
      {committed && isError && <p className="text-xs text-red">Search failed.</p>}
      {committed && data && data.results.length === 0 && (
        <p className="text-xs text-t3">No users match <span className="font-mono">{committed}</span>.</p>
      )}

      {data && data.results.length > 0 && (
        <Card title={`${data.results.length} result${data.results.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-t3">
                  <th className="pb-2">Wallet</th>
                  <th className="pb-2">Code</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Tier</th>
                  <th className="pb-2 text-right">Purchases</th>
                  <th className="pb-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((u) => (
                  <tr key={u.id} className="border-t border-border hover:bg-card-hover/40">
                    <td className="py-2">
                      <Link href={`/admin/users/${u.id}`} className="font-mono text-xs text-ice hover:underline">
                        {u.primary_wallet.slice(0, 8)}...{u.primary_wallet.slice(-6)}
                      </Link>
                      {u.display_name && (
                        <div className="text-[11px] text-t3">{u.display_name}</div>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs text-t2">{u.referral_code || '—'}</td>
                    <td className="py-2 text-xs text-t2">{u.email || '—'}</td>
                    <td className="py-2">
                      {u.is_epp && u.epp_tier ? (
                        <Badge variant="gold" size="sm">{u.epp_tier}</Badge>
                      ) : (
                        <span className="text-xs text-t4">community</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-t1">{u.purchase_count}</td>
                    <td className="py-2 text-xs text-t3">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
