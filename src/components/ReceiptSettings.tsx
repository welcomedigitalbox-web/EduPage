'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface ReceiptSettingLabels {
  title: string; sub: string; name: string; phone: string; note: string;
  footer: string; footerPh: string; save: string; saved: string;
}

export function ReceiptSettings({ initial, labels }: {
  initial: {
    receipt_shop_name?: string | null; receipt_phone?: string | null;
    receipt_note?: string | null; receipt_footer?: string | null;
  };
  labels: ReceiptSettingLabels;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    receipt_shop_name: initial.receipt_shop_name ?? '',
    receipt_phone: initial.receipt_phone ?? '',
    receipt_note: initial.receipt_note ?? '',
    receipt_footer: initial.receipt_footer ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    await fetch('/api/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(f),
    });
    setBusy(false); setOk(true); setTimeout(() => setOk(false), 2000);
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">{labels.name}</span>
          <input className={INPUT} value={f.receipt_shop_name}
            onChange={(e) => set('receipt_shop_name', e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">{labels.phone}</span>
          <input className={INPUT} value={f.receipt_phone}
            onChange={(e) => set('receipt_phone', e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">{labels.note}</span>
        <textarea className={INPUT} rows={2} value={f.receipt_note}
          onChange={(e) => set('receipt_note', e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">{labels.footer}</span>
        <textarea className={INPUT} rows={3} placeholder={labels.footerPh}
          value={f.receipt_footer}
          onChange={(e) => set('receipt_footer', e.target.value)} />
      </label>
      <button className="btn-primary text-sm" disabled={busy} onClick={save}>
        {ok ? labels.saved : labels.save}
      </button>
    </div>
  );
}
