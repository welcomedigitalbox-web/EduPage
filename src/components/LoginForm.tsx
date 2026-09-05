'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm({
  labels,
}: {
  labels: { email: string; password: string; button: string; failed: string; noProfile: string };
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get('next') || '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) { router.replace(next); router.refresh(); return; }
    const body = await res.json().catch(() => ({}));
    setErr(body.error === 'no_profile' ? labels.noProfile : labels.failed);
  }

  const input =
    'w-full rounded-lg border border-edge bg-panel p-2.5 text-sm outline-none focus:border-brand';

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div>
        <div className="label mb-1">{labels.email}</div>
        <input className={input} type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="label mb-1">{labels.password}</div>
        <input className={input} type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{labels.button}</button>
    </form>
  );
}
