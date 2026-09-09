'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface ChannelRow {
  id: string; name: string; kind: string;
  account_name: string | null; account_no: string | null; is_active: boolean;
}

export interface ChannelLabels {
  title: string; sub: string; name: string; namePh: string; kind: string;
  wallet: string; bank: string; cash: string;
  accountName: string; accountNamePh: string; accountNo: string; accountNoPh: string;
  add: string; save: string; cancel: string; edit: string; del: string;
  enable: string; disable: string; disabled: string; empty: string; inUse: string;
}

const BLANK = { name: '', kind: 'wallet', account_name: '', account_no: '' };

export function PaymentChannels({ rows, labels }: { rows: ChannelRow[]; labels: ChannelLabels }) {
  const router = useRouter();
  const [draft, setDraft] = useState(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch('/api/payment-channels', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(j.deactivated ? labels.inUse : null);
    router.refresh();
  }

  const kindName = (k: string) =>
    k === 'bank' ? labels.bank : k === 'cash' ? labels.cash : labels.wallet;

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_1fr_auto]">
        <input className={INPUT} placeholder={labels.namePh} value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select className={INPUT} value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          <option value="wallet">{labels.wallet}</option>
          <option value="bank">{labels.bank}</option>
          <option value="cash">{labels.cash}</option>
        </select>
        <input className={INPUT} placeholder={labels.accountNamePh} value={draft.account_name}
          onChange={(e) => setDraft({ ...draft, account_name: e.target.value })} />
        <input className={INPUT} placeholder={labels.accountNoPh} value={draft.account_no}
          onChange={(e) => setDraft({ ...draft, account_no: e.target.value })} />
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
            <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-muted">
              {kindName(r.kind)}
            </span>
            <span className="text-xs text-muted">
              {[r.account_name, r.account_no].filter(Boolean).join(' · ')}
            </span>
            {!r.is_active && <span className="text-[10px] text-muted">({labels.disabled})</span>}
            <span className="ml-auto flex gap-2">
              <button className="btn text-xs" onClick={() => {
                setEditing(r.id);
                setDraft({
                  name: r.name, kind: r.kind,
                  account_name: r.account_name ?? '', account_no: r.account_no ?? '',
                });
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
