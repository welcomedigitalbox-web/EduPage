'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface DetailLabels {
  profile: string; name: string; phone: string; email: string; address: string; city: string;
  store: string; rep: string; tier: string; none: string; save: string; savePos: string;
  saved: string; needContact: string; notes: string; tags: string; discountNote: string;
}

export function ProfileForm({
  contactId, initial, stores, reps, tiers, labels,
}: {
  contactId: string;
  initial: {
    name: string; phone: string; email: string; address: string; city: string;
    store_id: string; preferred_rep_id: string; loyalty_tier_id: string;
    notes: string; tags: string[];
  };
  stores: { id: string; name: string; region: string | null }[];
  reps: { id: string; store_id: string; name: string }[];
  tiers: { id: string; store_id: string; name: string; discount_percent: number }[];
  labels: DetailLabels;
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, tags: initial.tags.join(', ') });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v })); setMsg(null); setErr(null);
  }

  // Reps and tiers belong to a shop, so only show the ones for the chosen shop.
  const repsHere = reps.filter((r) => !f.store_id || r.store_id === f.store_id);
  const tiersHere = tiers.filter((t) => !f.store_id || t.store_id === f.store_id);

  async function save(syncPos: boolean) {
    setBusy(true); setErr(null); setMsg(null);
    const res = await fetch(`/api/contacts/${contactId}/profile`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: f.name, phone: f.phone, email: f.email, address: f.address, city: f.city,
        store_id: f.store_id || null,
        preferred_rep_id: f.preferred_rep_id || null,
        loyalty_tier_id: f.loyalty_tier_id || null,
        notes: f.notes,
        tags: f.tags.split(','),
        sync_pos: syncPos,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b.error === 'need_phone_or_email' ? labels.needContact : String(b.error ?? 'error'));
      return;
    }
    setMsg(labels.saved);
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="label">{labels.profile}</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.name}>
          <input className={INPUT} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={labels.phone}>
          <input className={INPUT} value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={labels.email}>
          <input className={INPUT} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={labels.city}>
          <input className={INPUT} value={f.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
      </div>

      <Field label={labels.address}>
        <textarea className={INPUT} rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={labels.store}>
          <select className={INPUT} value={f.store_id} onChange={(e) => set('store_id', e.target.value)}>
            <option value="">{labels.none}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.region ? ` · ${s.region}` : ''}</option>
            ))}
          </select>
        </Field>
        <Field label={labels.rep}>
          <select className={INPUT} value={f.preferred_rep_id}
            onChange={(e) => set('preferred_rep_id', e.target.value)}>
            <option value="">{labels.none}</option>
            {repsHere.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label={labels.tier}>
          <select className={INPUT} value={f.loyalty_tier_id}
            onChange={(e) => set('loyalty_tier_id', e.target.value)}>
            <option value="">{labels.none}</option>
            {tiersHere.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.discount_percent}%</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={labels.tags}>
        <input className={INPUT} value={f.tags} onChange={(e) => set('tags', e.target.value)} />
      </Field>
      <Field label={labels.notes}>
        <textarea className={INPUT} rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <p className="text-[11px] text-muted">{labels.discountNote}</p>
      {err && <p className="text-sm text-bad">{err}</p>}
      {msg && <p className="text-sm text-good">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy} onClick={() => save(false)}>{labels.save}</button>
        <button className="btn-primary" disabled={busy} onClick={() => save(true)}>{labels.savePos}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}
