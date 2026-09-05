'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface FxRow { date: string; mmk_per_usd: number; note: string | null }

/**
 * Rates are entered by hand rather than pulled from a feed: Myanmar's market
 * rate and the rate a shop actually gets are different numbers, and only the
 * shop knows which one its books use.
 */
export function FxRates({
  rows, labels,
}: {
  rows: FxRow[];
  labels: {
    title: string; sub: string; date: string; rate: string; add: string;
    del: string; empty: string; effective: string;
  };
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString('en-CA');
  const [draft, setDraft] = useState({ date: today, mmk_per_usd: rows[0]?.mmk_per_usd ?? 4500 });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch('/api/fx', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="text-[11px] text-muted">{labels.date}</span>
          <input type="date" className={INPUT} value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <label className="flex-1">
          <span className="text-[11px] text-muted">{labels.rate}</span>
          <input type="number" className={INPUT} value={draft.mmk_per_usd}
            onChange={(e) => setDraft({ ...draft, mmk_per_usd: Number(e.target.value) })} />
        </label>
        <button className="btn-primary text-xs" disabled={busy} onClick={save}>{labels.add}</button>
      </div>

      <div className="max-h-60 divide-y divide-edge overflow-y-auto rounded-lg border border-edge">
        {rows.map((r) => (
          <div key={r.date} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="tabular-nums">{r.date}</span>
            <span className="tabular-nums">{Number(r.mmk_per_usd).toLocaleString()} MMK</span>
            <button className="btn text-xs" onClick={async () => {
              await fetch('/api/fx', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ delete_date: r.date }),
              });
              router.refresh();
            }}>{labels.del}</button>
          </div>
        ))}
        {!rows.length && <div className="p-4 text-center text-xs text-muted">{labels.empty}</div>}
      </div>

      <p className="text-[11px] text-muted">{labels.effective}</p>
    </div>
  );
}
