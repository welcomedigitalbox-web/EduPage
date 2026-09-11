'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface SellerRow {
  id: string; name: string; phone: string | null;
  shop_id: string | null; is_active: boolean;
}

export interface SellerLabels {
  title: string; sub: string; namePh: string; phonePh: string; anyShop: string;
  add: string; save: string; cancel: string; edit: string; del: string;
  enable: string; disable: string; disabled: string; empty: string; inUse: string;
}

const BLANK = { name: '', phone: '', shop_id: '' };

export function SalesPeople({ rows, shops, labels }: {
  rows: SellerRow[];
  shops: { id: string; name: string }[];
  labels: SellerLabels;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch('/api/sales-people', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(j.deactivated ? labels.inUse : null);
    router.refresh();
  }

  const shopName = (id: string | null) => shops.find((s) => s.id === id)?.name ?? '';

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input className={INPUT} placeholder={labels.namePh} value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className={INPUT} placeholder={labels.phonePh} value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        <select className={INPUT} value={draft.shop_id}
          onChange={(e) => setDraft({ ...draft, shop_id: e.target.value })}>
          <option value="">{labels.anyShop}</option>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn-primary text-xs" disabled={busy || !draft.name.trim()}
          onClick={async () => {
            await post(editing ? { ...draft, id: editing } : draft);
            setDraft(BLANK); setEditing(null);
          }}>
          {editing ? labels.save : labels.add}
        </button>
      </div>
      {editing && (
        <button className="btn text-xs" onClick={() => { setDraft(BLANK); setEditing(null); }}>
          {labels.cancel}
        </button>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}

      <div className="divide-y divide-edge rounded-lg border border-edge">
        {rows.length === 0 && <div className="p-3 text-sm text-muted">{labels.empty}</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className={r.is_active ? '' : 'text-muted line-through'}>{r.name}</span>
            <span className="text-xs text-muted">
              {[r.phone, shopName(r.shop_id)].filter(Boolean).join(' · ')}
            </span>
            {!r.is_active && <span className="text-[10px] text-muted">({labels.disabled})</span>}
            <span className="ml-auto flex gap-2">
              <button className="btn text-xs" onClick={() => {
                setEditing(r.id);
                setDraft({ name: r.name, phone: r.phone ?? '', shop_id: r.shop_id ?? '' });
              }}>{labels.edit}</button>
              <button className="btn text-xs" disabled={busy}
                onClick={() => post({ id: r.id, is_active: !r.is_active })}>
                {r.is_active ? labels.disable : labels.enable}
              </button>
              <button className="btn text-xs" disabled={busy}
                onClick={() => post({ delete_id: r.id })}>{labels.del}</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
