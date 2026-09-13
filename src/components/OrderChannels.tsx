'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface ChannelItem { id: string; name: string; is_active: boolean }

export interface OrderChannelLabels {
  title: string; sub: string; namePh: string;
  add: string; save: string; cancel: string; edit: string; del: string;
  enable: string; disable: string; disabled: string; empty: string; inUse: string;
}

export function OrderChannels({ rows, labels }: {
  rows: ChannelItem[]; labels: OrderChannelLabels;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch('/api/order-channels', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(j.deactivated ? labels.inUse : null);
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>

      <div className="flex gap-2">
        <input className={INPUT} placeholder={labels.namePh} value={name}
          onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0 text-xs" disabled={busy || !name.trim()}
          onClick={async () => {
            await post(editing ? { id: editing, name } : { name });
            setName(''); setEditing(null);
          }}>
          {editing ? labels.save : labels.add}
        </button>
        {editing && (
          <button className="btn shrink-0 text-xs"
            onClick={() => { setName(''); setEditing(null); }}>{labels.cancel}</button>
        )}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}

      <div className="divide-y divide-edge rounded-lg border border-edge">
        {rows.length === 0 && <div className="p-3 text-sm text-muted">{labels.empty}</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 p-3 text-sm">
            <span className={r.is_active ? '' : 'text-muted line-through'}>{r.name}</span>
            {!r.is_active && <span className="text-[10px] text-muted">({labels.disabled})</span>}
            <span className="ml-auto flex gap-2">
              <button className="btn text-xs"
                onClick={() => { setEditing(r.id); setName(r.name); }}>{labels.edit}</button>
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
