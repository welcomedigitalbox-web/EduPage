'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { paymentState, balanceDue } from '@/lib/order-payment';

const FIELD =
  'rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface PaymentRow {
  id: string; amount: number; channel_name: string | null; ref: string | null;
  paid_at: string; note: string | null; actor_name: string | null;
  slips: string[] | null;
}

export interface PaymentLabels {
  title: string; received: string; due: string;
  paid: string; partial: string; unpaid: string;
  add: string; amount: string; channel: string; pickChannel: string;
  ref: string; refPh: string; date: string; note: string; notePh: string;
  slip: string; slipAdd: string; uploading: string;
  save: string; saving: string; cancel: string; del: string; delConfirm: string;
  none: string; failed: string; full: string;
}

/**
 * What has actually come in. A COD order is unpaid until the delivery company
 * hands the cash over, which can be days later and in parts — so each receipt
 * is its own row, and "paid" is the arithmetic rather than somebody's opinion.
 */
export function OrderPayments({
  orderId, grandTotal, received, rows, channels, isManager, labels,
}: {
  orderId: string;
  grandTotal: number;
  received: number;
  rows: PaymentRow[];
  channels: { id: string; name: string }[];
  isManager: boolean;
  labels: PaymentLabels;
}) {
  const router = useRouter();
  const due = balanceDue(grandTotal, received);
  const state = paymentState(grandTotal, received);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    amount: due, channel_id: '', ref: '', note: '',
    paid_at: '', slips: [] as string[],
  });

  const fmt = (n: number) => Number(n || 0).toLocaleString();
  const tone = state === 'paid' ? 'border-good text-good'
    : state === 'partial' ? 'border-brand text-brand' : 'border-bad text-bad';
  const stateLabel = state === 'paid' ? labels.paid
    : state === 'partial' ? labels.partial : labels.unpaid;

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    const res = await fetch('/api/online-orders/payments', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(`${labels.failed}: ${j.error ?? res.status}`); return false; }
    router.refresh();
    return true;
  }

  async function upload(files: FileList) {
    setUploading(true);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) added.push(j.url as string);
    }
    setUploading(false);
    if (added.length) setF((p) => ({ ...p, slips: [...p.slips, ...added] }));
  }

  return (
    <div className="card space-y-3 p-4 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="label">{labels.title}</div>
        <span className={`rounded border px-2 py-0.5 text-[11px] ${tone}`}>{stateLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted">{labels.received}</div>
          <div className="tabular-nums">{fmt(received)} MMK</div>
        </div>
        <div>
          <div className="text-xs text-muted">{labels.due}</div>
          <div className={`tabular-nums ${due > 0 ? 'text-bad' : 'text-good'}`}>
            {fmt(due)} MMK
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-edge rounded-lg border border-edge text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-2 p-2">
              <span className="tabular-nums">{fmt(r.amount)}</span>
              <span className="text-[11px] text-muted">
                {[r.channel_name, r.ref, r.paid_at, r.actor_name].filter(Boolean).join(' · ')}
              </span>
              {(r.slips ?? []).length > 0 && (
                <span className="flex gap-1">
                  {(r.slips ?? []).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer"
                       className="h-8 w-8 overflow-hidden rounded border border-edge">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </span>
              )}
              {isManager && (
                <button className="ml-auto btn text-[11px] text-bad" disabled={busy}
                  onClick={() => { if (confirm(labels.delConfirm)) post({ delete_id: r.id }); }}>
                  {labels.del}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && <p className="text-xs text-muted">{labels.none}</p>}

      {!open && due > 0 && (
        <button className="btn-primary text-sm" onClick={() => {
          setF((p) => ({ ...p, amount: due })); setOpen(true);
        }}>{labels.add}</button>
      )}

      {open && (
        <div className="space-y-3 rounded-lg border border-edge p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">{labels.amount}</span>
              <div className="flex gap-1">
                <input className={`min-w-0 flex-1 ${FIELD}`} type="number" min={0} step="any"
                  inputMode="decimal" value={f.amount}
                  onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
                <button className="btn shrink-0 text-xs"
                  onClick={() => setF({ ...f, amount: due })}>{labels.full}</button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">{labels.channel}</span>
              <select className={`w-full ${FIELD}`} value={f.channel_id}
                onChange={(e) => setF({ ...f, channel_id: e.target.value })}>
                <option value="">{labels.pickChannel}</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">{labels.ref}</span>
              <input className={`w-full ${FIELD}`} placeholder={labels.refPh} value={f.ref}
                onChange={(e) => setF({ ...f, ref: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">{labels.date}</span>
              <input className={`w-full ${FIELD}`} type="date" value={f.paid_at}
                onChange={(e) => setF({ ...f, paid_at: e.target.value })} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">{labels.note}</span>
            <input className={`w-full ${FIELD}`} placeholder={labels.notePh} value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>

          <div>
            <span className="mb-1 block text-[11px] text-muted">{labels.slip}</span>
            <div className="flex flex-wrap items-center gap-2">
              {f.slips.map((u) => (
                <div key={u} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-14 w-14 rounded border border-edge object-cover" />
                  <button
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-edge bg-panel px-1.5 text-[10px]"
                    onClick={() => setF((p) => ({ ...p, slips: p.slips.filter((x) => x !== u) }))}>
                    ✕
                  </button>
                </div>
              ))}
              <label className="btn cursor-pointer text-xs">
                {uploading ? labels.uploading : labels.slipAdd}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) upload(e.target.files);
                    e.target.value = '';
                  }} />
              </label>
            </div>
          </div>

          {err && <p className="text-xs text-bad">{err}</p>}

          <div className="flex gap-2">
            <button className="btn-primary text-sm" disabled={busy || !(f.amount > 0)}
              onClick={async () => {
                const ok = await post({ order_id: orderId, ...f });
                if (ok) {
                  setOpen(false);
                  setF({ amount: 0, channel_id: '', ref: '', note: '', paid_at: '', slips: [] });
                }
              }}>
              {busy ? labels.saving : labels.save}
            </button>
            <button className="btn text-sm" onClick={() => setOpen(false)}>{labels.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
