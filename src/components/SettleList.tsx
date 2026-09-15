'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const FIELD =
  'rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface SettleRow {
  id: string; order_no: number; customer_name: string; phone: string | null;
  order_date: string; grand_total: number; amount_received: number;
  delivery_method: string | null; shop: string | null; payment_method: string;
}

export interface SettleLabels {
  title: string; sub: string;
  channel: string; pickChannel: string; ref: string; refPh: string;
  date: string; note: string; notePh: string;
  settle: string; settling: string; selected: string; none: string;
  all: string; clear: string; search: string; failed: string;
  order: string; customer: string; delivery: string; due: string; amount: string;
}

/**
 * A courier hands over a week of COD against one statement. Ticking the orders
 * on that sheet and settling them together is the job — doing it one order at a
 * time is where the mistakes come from.
 */
export function SettleList({ rows, channels, labels }: {
  rows: SettleRow[];
  channels: { id: string; name: string }[];
  labels: SettleLabels;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [f, setF] = useState({ channel_id: '', ref: '', paid_at: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const due = (r: SettleRow) =>
    Math.max(0, Number(r.grand_total ?? 0) - Number(r.amount_received ?? 0));

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.customer_name?.toLowerCase().includes(term)
      || (r.phone ?? '').includes(term)
      || String(r.order_no).includes(term)
      || (r.delivery_method ?? '').toLowerCase().includes(term));
  }, [rows, q]);

  const ids = Object.keys(picked);
  const total = ids.reduce((a, id) => a + Number(picked[id] || 0), 0);
  const fmt = (n: number) => Number(n || 0).toLocaleString();

  function toggle(r: SettleRow) {
    setPicked((p) => {
      const next = { ...p };
      if (next[r.id] != null) delete next[r.id];
      else next[r.id] = due(r);
      return next;
    });
  }

  async function settle() {
    setBusy(true); setErr(null);
    const res = await fetch('/api/online-orders/payments', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: ids.map((id) => ({ order_id: id, amount: picked[id] })),
        ...f,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(`${labels.failed}: ${j.error ?? res.status}`); return; }
    setPicked({});
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-4">
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
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">{labels.note}</span>
            <input className={`w-full ${FIELD}`} placeholder={labels.notePh} value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input className={`w-56 ${FIELD}`} placeholder={labels.search} value={q}
            onChange={(e) => setQ(e.target.value)} />
          <button className="btn text-xs"
            onClick={() => setPicked(Object.fromEntries(shown.map((r) => [r.id, due(r)])))}>
            {labels.all}
          </button>
          {ids.length > 0 && (
            <button className="btn text-xs" onClick={() => setPicked({})}>{labels.clear}</button>
          )}
          <span className="ml-auto text-sm">
            {labels.selected.replace('{n}', String(ids.length))}
            {ids.length > 0 && <span className="ml-2 tabular-nums">{fmt(total)} MMK</span>}
          </span>
          <button className="btn-primary text-sm" disabled={busy || !ids.length}
            onClick={settle}>
            {busy ? labels.settling : labels.settle}
          </button>
        </div>
        {err && <p className="text-xs text-bad">{err}</p>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal"> </th>
              <th className="p-3 text-left font-normal">{labels.order}</th>
              <th className="p-3 text-left font-normal">{labels.customer}</th>
              <th className="p-3 text-left font-normal">{labels.delivery}</th>
              <th className="p-3 text-right font-normal">{labels.due}</th>
              <th className="p-3 text-right font-normal">{labels.amount}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const on = picked[r.id] != null;
              return (
                <tr key={r.id}
                    className={`border-b border-edge/50 last:border-0 ${on ? 'bg-brand/10' : ''}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={on} onChange={() => toggle(r)} />
                  </td>
                  <td className="p-3">
                    <Link href={`/orders/${r.id}`} className="hover:text-brand">
                      EBH-{String(r.order_no).padStart(5, '0')}
                    </Link>
                    <div className="text-[11px] text-muted">{r.order_date}</div>
                  </td>
                  <td className="p-3">
                    {r.customer_name}
                    <div className="text-[11px] text-muted">{r.phone ?? '—'}</div>
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {r.delivery_method ?? '—'}
                    <div>{r.shop ?? ''}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{fmt(due(r))}</td>
                  <td className="p-3 text-right">
                    <input
                      className={`w-28 text-right ${FIELD} ${on ? '' : 'opacity-40'}`}
                      type="number" min={0} step="any" disabled={!on}
                      value={on ? picked[r.id] : due(r)}
                      onChange={(e) =>
                        setPicked((p) => ({ ...p, [r.id]: Number(e.target.value) }))} />
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr><td colSpan={6} className="p-8 text-center text-muted">{labels.none}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
