'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useAnnouncements,
  useKillSwitches,
  useI18nStatus,
} from '@/hooks/useAdmin';
import { authFetch } from '@/lib/api/fetch';

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const announcements = useAnnouncements();
  const killswitches = useKillSwitches();
  const i18n = useI18nStatus();

  const [newEn, setNewEn] = useState('');
  const [newTc, setNewTc] = useState('');
  const [newSc, setNewSc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function createAnnouncement() {
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await authFetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_en: newEn,
          message_tc: newTc || undefined,
          message_sc: newSc || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setNewEn('');
      setNewTc('');
      setNewSc('');
      qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    } catch (e) {
      setCreateErr(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }

  async function toggleAnnouncement(id: string, is_active: boolean) {
    await authFetch('/api/admin/announcements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active }),
    });
    qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm('Delete this announcement?')) return;
    await authFetch(`/api/admin/announcements?id=${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-t1 font-display">Settings</h1>
        <p className="text-sm text-t3">
          Announcements, per-endpoint kill switches, and translation coverage.
        </p>
      </div>

      {/* Announcements */}
      <Card title="Announcements">
        <div className="mb-4 space-y-2">
          <input
            type="text"
            placeholder="English (required)"
            value={newEn}
            onChange={(e) => setNewEn(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Traditional Chinese (optional)"
              value={newTc}
              onChange={(e) => setNewTc(e.target.value)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1"
            />
            <input
              type="text"
              placeholder="Simplified Chinese (optional)"
              value={newSc}
              onChange={(e) => setNewSc(e.target.value)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-t1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={createAnnouncement}
              loading={creating}
              disabled={newEn.trim().length < 2}
            >
              Publish
            </Button>
            {createErr && <span className="text-xs text-red">{createErr}</span>}
          </div>
        </div>
        <ul className="divide-y divide-border">
          {announcements.data?.rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {a.is_active ? (
                    <Badge variant="green" size="sm">active</Badge>
                  ) : (
                    <Badge variant="default" size="sm">hidden</Badge>
                  )}
                  <span className="text-[11px] text-t3">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-t1">{a.message_en}</p>
                {(a.message_tc || a.message_sc) && (
                  <p className="mt-1 text-[11px] text-t3">
                    {a.message_tc && <span>TC ✓ </span>}
                    {a.message_sc && <span>SC ✓</span>}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => toggleAnnouncement(a.id, !a.is_active)}
                  className="rounded border border-border bg-card px-2 py-1 text-[11px] text-t2 hover:bg-card-hover"
                >
                  {a.is_active ? 'Hide' : 'Activate'}
                </button>
                <button
                  onClick={() => deleteAnnouncement(a.id)}
                  className="rounded border border-red/20 bg-red/5 px-2 py-1 text-[11px] text-red hover:bg-red/10"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {announcements.data?.rows.length === 0 && (
            <li className="py-3 text-xs text-t3">No announcements.</li>
          )}
        </ul>
      </Card>

      {/* Kill switches */}
      <Card title="Kill switches">
        <p className="mb-3 text-[11px] text-t4">
          Disabling a switch makes the corresponding admin endpoint 503 until re-enabled. Reason required to disable — goes to the audit log.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-t3">
              <th className="py-2">Key</th>
              <th className="py-2">Status</th>
              <th className="py-2">Reason</th>
              <th className="py-2">Updated</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {killswitches.data?.rows.map((k) => (
              <KillSwitchRow key={k.key} row={k} onChanged={() => qc.invalidateQueries({ queryKey: ['admin', 'killswitches'] })} />
            ))}
            {killswitches.data?.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-t3">
                  No switches configured. Apply migration 019.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* i18n */}
      <Card title="Translation coverage">
        <p className="mb-3 text-[11px] text-t4">
          Diff against the English key set. Missing keys are fallbacks that render as the raw key in production — fix in lib/i18n/.
        </p>
        {i18n.data && (
          <ul className="space-y-2 text-sm">
            {i18n.data.rows.map((r) => (
              <li key={r.locale} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div>
                  <span className="font-mono text-xs text-t1">{r.locale.toUpperCase()}</span>
                  {' · '}
                  <span className="text-t3 text-xs">{r.totalKeys} keys</span>
                </div>
                {r.missingKeys.length === 0 ? (
                  <Badge variant="green" size="sm">complete</Badge>
                ) : (
                  <details className="text-right">
                    <summary className="cursor-pointer text-xs text-amber">
                      {r.missingKeys.length} missing
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-y-auto text-right text-[10px] text-t3">
                      {r.missingKeys.slice(0, 30).join('\n')}
                      {r.missingKeys.length > 30 && `\n... +${r.missingKeys.length - 30} more`}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function KillSwitchRow({
  row,
  onChanged,
}: {
  row: { key: string; disabled: boolean; reason: string | null; updated_at: string; updated_by: string | null };
  onChanged: () => void;
}) {
  const [reason, setReason] = useState(row.reason || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle(nextDisabled: boolean) {
    if (nextDisabled && reason.trim().length < 3) {
      setEditing(true);
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch('/api/admin/killswitches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: row.key, disabled: nextDisabled, reason: reason.trim() || undefined }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-border">
      <td className="py-2 font-mono text-xs text-t2">{row.key}</td>
      <td className="py-2">
        {row.disabled ? (
          <Badge variant="red" size="sm">disabled</Badge>
        ) : (
          <Badge variant="green" size="sm">enabled</Badge>
        )}
      </td>
      <td className="py-2">
        {editing ? (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="w-full rounded border border-border bg-bg px-2 py-1 text-xs text-t1"
          />
        ) : (
          <span className="text-xs text-t3">{row.reason || '—'}</span>
        )}
      </td>
      <td className="py-2 text-[11px] text-t3">
        {new Date(row.updated_at).toLocaleString()}
      </td>
      <td className="py-2 text-right">
        <button
          disabled={busy}
          onClick={() => toggle(!row.disabled)}
          className={`rounded border px-2 py-1 text-[11px] ${
            row.disabled
              ? 'border-green/30 bg-green/5 text-green'
              : 'border-red/20 bg-red/5 text-red'
          } disabled:opacity-50`}
        >
          {row.disabled ? 'Enable' : 'Disable'}
        </button>
      </td>
    </tr>
  );
}
