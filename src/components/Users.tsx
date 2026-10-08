'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { APP_URL } from '@/lib/apps';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'agent' | 'manager';
  manual?: boolean;
}

export interface Candidate {
  id: string;
  email: string | null;
  role: string | null;
  department: string | null;
}

export interface UserLabels {
  email: string;
  name: string;
  role: string;
  agent: string;
  manager: string;
  agentHint: string;
  managerHint: string;
}

// Who can open EduPage, and as what. The job someone holds on the POS
// decides this by default; the controls here record the exceptions, so a
// cashier can be let in for Messenger without changing what she is on the
// POS, and someone can be kept out without taking her job away.
export function UserList({
  users, meId, labels, candidates = [],
}: { users: UserRow[]; meId: string; labels: UserLabels; candidates?: Candidate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState('');
  const [as, setAs] = useState<'agent' | 'manager'>('agent');
  const [err, setErr] = useState('');

  const here = new Set(users.map((u) => u.id));
  const rest = candidates.filter((c) => !here.has(c.id) && c.email);

  async function set(userId: string, access: string) {
    setBusy(userId);
    setErr('');
    try {
      const r = await fetch('/api/users/access', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, access }),
      });
      if (!r.ok) throw new Error((await r.json())?.error || r.statusText);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const managers = users.filter((u) => u.role === 'manager');
  const agents = users.filter((u) => u.role === 'agent');

  const Group = ({ title, hint, rows }: { title: string; hint: string; rows: UserRow[] }) => (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 p-2 text-sm">
              <span>
                {u.name || u.email}
                {u.id === meId && <span className="ml-2 text-xs text-muted">(you)</span>}
                {u.manual && <span className="ml-2 text-xs text-muted">· set by hand</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted">{u.email}</span>
                <button
                  onClick={() => set(u.id, u.role === 'agent' ? 'manager' : 'agent')}
                  disabled={busy === u.id}
                  className="text-xs underline disabled:opacity-40"
                >
                  {u.role === 'agent' ? labels.manager : labels.agent}
                </button>
                {u.manual ? (
                  <button
                    onClick={() => set(u.id, 'auto')}
                    disabled={busy === u.id}
                    className="text-xs underline disabled:opacity-40"
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  onClick={() => set(u.id, 'none')}
                  disabled={busy === u.id || u.id === meId}
                  className="text-xs text-red-500 underline disabled:opacity-40"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Group title={labels.manager} hint={labels.managerHint} rows={managers} />
      <Group title={labels.agent} hint={labels.agentHint} rows={agents} />

      {rest.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge p-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="rounded border border-edge bg-transparent px-2 py-1 text-sm"
          >
            <option value="">Add someone…</option>
            {rest.map((c) => (
              <option key={c.id} value={c.id}>
                {c.email} · {c.role}
              </option>
            ))}
          </select>
          <select
            value={as}
            onChange={(e) => setAs(e.target.value as 'agent' | 'manager')}
            className="rounded border border-edge bg-transparent px-2 py-1 text-sm"
          >
            <option value="agent">{labels.agent}</option>
            <option value="manager">{labels.manager}</option>
          </select>
          <button
            onClick={() => pick && set(pick, as)}
            disabled={!pick || busy !== ''}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {err && <p className="text-xs text-red-500">{err}</p>}

      <p className="text-xs text-muted">
        Accounts themselves are created on the POS.{' '}
        <a href={`${APP_URL.pos}/admin/users`} className="underline">
          Open user management
        </a>
      </p>
    </div>
  );
}
