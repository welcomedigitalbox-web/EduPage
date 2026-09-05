'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT = 'rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface UserRow {
  id: string; email: string; name: string | null; role: 'agent' | 'manager';
  is_active: boolean; last_login_at: string | null;
}

export interface UserLabels {
  email: string; name: string; role: string; agent: string; manager: string;
  agentHint: string; managerHint: string; password: string; passwordHint: string;
  add: string; active: string; disabled: string; disable: string; enable: string;
  resetPw: string; lastLogin: string; never: string; emailTaken: string;
  pwShort: string; saved: string; selfNote: string;
}

export function UserManager({
  users, meId, labels,
}: { users: UserRow[]; meId: string; labels: UserLabels }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'manager'>('agent');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setErr(null); setBusy(true);
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, password, role }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b.error === 'email_taken' ? labels.emailTaken
        : b.error === 'password_too_short' ? labels.pwShort : String(b.error ?? 'error'));
      return;
    }
    setEmail(''); setName(''); setPassword(''); setRole('agent');
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b.error === 'password_too_short' ? labels.pwShort
        : b.error === 'cannot_demote_self' ? labels.selfNote : String(b.error ?? 'error'));
      return;
    }
    setErr(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <div className="label">{labels.add}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={INPUT} placeholder={labels.email} type="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={INPUT} placeholder={labels.name}
            value={name} onChange={(e) => setName(e.target.value)} />
          <input className={INPUT} placeholder={labels.password} type="text"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className={INPUT} value={role}
            onChange={(e) => setRole(e.target.value as 'agent' | 'manager')}>
            <option value="agent">{labels.agent}</option>
            <option value="manager">{labels.manager}</option>
          </select>
        </div>
        <p className="text-[11px] text-muted">
          {labels.passwordHint} · {role === 'manager' ? labels.managerHint : labels.agentHint}
        </p>
        {err && <p className="text-xs text-bad">{err}</p>}
        <button className="btn-primary" disabled={busy || !email || !password} onClick={create}>
          {labels.add}
        </button>
      </div>

      <div className="card divide-y divide-edge">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate">{u.name || u.email}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] ${
                  u.role === 'manager' ? 'bg-brand/20 text-brand' : 'bg-edge text-muted'}`}>
                  {u.role === 'manager' ? labels.manager : labels.agent}
                </span>
                {!u.is_active && (
                  <span className="rounded bg-bad/20 px-1.5 py-0.5 text-[11px] text-bad">{labels.disabled}</span>
                )}
              </div>
              <div className="text-[11px] text-muted">
                {u.name ? `${u.email} · ` : ''}
                {labels.lastLogin}: {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : labels.never}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <select
                className="rounded-lg border border-edge bg-panel px-2 py-1 text-xs"
                value={u.role} disabled={u.id === meId}
                onChange={(e) => patch(u.id, { role: e.target.value })}>
                <option value="agent">{labels.agent}</option>
                <option value="manager">{labels.manager}</option>
              </select>
              <button className="btn text-xs" onClick={() => {
                const pw = prompt(labels.resetPw);
                if (pw) patch(u.id, { password: pw });
              }}>{labels.resetPw}</button>
              <button className="btn text-xs" disabled={u.id === meId}
                onClick={() => patch(u.id, { is_active: !u.is_active })}>
                {u.is_active ? labels.disable : labels.enable}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
