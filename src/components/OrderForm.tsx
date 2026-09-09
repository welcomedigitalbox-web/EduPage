'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface Line {
  barcode: string; description: string; unit_price: number | ''; qty: number | '';
}

export interface OrderFormLabels {
  customer: string; name: string; phone: string; city: string; address: string;
  shop: string; pickShop: string; items: string; barcode: string; description: string;
  unitPrice: string; qty: string; lineTotal: string; addLine: string; removeLine: string;
  money: string; subtotal: string; discount: string; deliveryFee: string; grandTotal: string;
  payment: string; cod: string; transfer: string; prepaid: string; advance: string;
  deliveryMethod: string; deliveryPh: string; orderDate: string; status: string;
  note: string; notePh: string; save: string; saving: string; failed: string; nameRequired: string;
  statuses: Record<string, string>;
}

export function OrderForm({
  shops, initial, contactId, conversationId, orderId, labels,
}: {
  shops: { id: string; name: string; region: string | null }[];
  initial: Partial<{
    customer_name: string; phone: string; city: string; delivery_address: string;
    shop_id: string; order_date: string; delivery_method: string; payment_method: string;
    advance_payment: number; delivery_fee: number; discount: number; status: string;
    note: string; items: Line[];
  }>;
  contactId?: string | null;
  conversationId?: string | null;
  orderId?: string;
  labels: OrderFormLabels;
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' });

  const [f, setF] = useState({
    customer_name: initial.customer_name ?? '',
    phone: initial.phone ?? '',
    city: initial.city ?? '',
    delivery_address: initial.delivery_address ?? '',
    shop_id: initial.shop_id ?? '',
    order_date: initial.order_date ?? today,
    delivery_method: initial.delivery_method ?? '',
    payment_method: initial.payment_method ?? 'cod',
    advance_payment: initial.advance_payment ?? 0,
    delivery_fee: initial.delivery_fee ?? 0,
    discount: initial.discount ?? 0,
    status: initial.status ?? 'pending',
    note: initial.note ?? '',
  });
  const [lines, setLines] = useState<Line[]>(
    initial.items?.length
      ? initial.items
      : [{ barcode: '', description: '', unit_price: '', qty: 1 }]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const money = useMemo(() => {
    const subtotal = lines.reduce(
      (a, l) => a + Number(l.unit_price || 0) * Number(l.qty || 0), 0
    );
    const grand = Math.max(0, subtotal - Number(f.discount || 0) + Number(f.delivery_fee || 0));
    return { subtotal, grand };
  }, [lines, f.discount, f.delivery_fee]);

  const fmt = (n: number) => n.toLocaleString();

  async function save() {
    if (!f.customer_name.trim()) { setErr(labels.nameRequired); return; }
    setBusy(true); setErr(null);
    const res = await fetch('/api/online-orders', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...f,
        id: orderId,
        contact_id: contactId ?? null,
        conversation_id: conversationId ?? null,
        items: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            barcode: l.barcode || null,
            description: l.description,
            unit_price: Number(l.unit_price || 0),
            qty: Number(l.qty || 0),
            line_total: Number(l.unit_price || 0) * Number(l.qty || 0),
          })),
      }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(`${labels.failed}: ${j.error ?? res.status}`); return; }
    router.push(`/orders/${j.id ?? orderId}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* customer */}
      <section className="card space-y-3 p-4">
        <div className="label">{labels.customer}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={labels.name}>
            <input className={INPUT} value={f.customer_name}
              onChange={(e) => set('customer_name', e.target.value)} />
          </Field>
          <Field label={labels.phone}>
            <input className={INPUT} value={f.phone}
              onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={labels.city}>
            <input className={INPUT} value={f.city}
              onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label={labels.shop}>
            <select className={INPUT} value={f.shop_id}
              onChange={(e) => set('shop_id', e.target.value)}>
              <option value="">{labels.pickShop}</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.region ? ` · ${s.region}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={labels.address}>
          <textarea className={INPUT} rows={2} value={f.delivery_address}
            onChange={(e) => set('delivery_address', e.target.value)} />
        </Field>
      </section>

      {/* items */}
      <section className="card p-4">
        <div className="label mb-3">{labels.items}</div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 border-b border-edge/60 pb-3 last:border-0 sm:grid-cols-[8rem_1fr_7rem_5rem_7rem_2rem]">
              <input className={INPUT} placeholder={labels.barcode} value={l.barcode}
                onChange={(e) => setLine(i, { barcode: e.target.value })} />
              <input className={INPUT} placeholder={labels.description} value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={INPUT} type="number" inputMode="decimal" placeholder={labels.unitPrice}
                value={l.unit_price}
                onChange={(e) => setLine(i, { unit_price: e.target.value === '' ? '' : Number(e.target.value) })} />
              <input className={INPUT} type="number" inputMode="decimal" placeholder={labels.qty}
                value={l.qty}
                onChange={(e) => setLine(i, { qty: e.target.value === '' ? '' : Number(e.target.value) })} />
              <div className="flex items-center justify-end px-2 text-sm tabular-nums text-muted">
                {fmt(Number(l.unit_price || 0) * Number(l.qty || 0))}
              </div>
              <button className="btn text-xs" aria-label={labels.removeLine}
                onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
        </div>

        <button className="btn mt-3 text-xs"
          onClick={() => setLines((p) => [...p, { barcode: '', description: '', unit_price: '', qty: 1 }])}>
          + {labels.addLine}
        </button>
      </section>

      {/* money + delivery */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <div className="label">{labels.money}</div>
          <Row k={labels.subtotal} v={fmt(money.subtotal)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.discount}>
              <input className={INPUT} type="number" inputMode="decimal" value={f.discount}
                onChange={(e) => set('discount', Number(e.target.value))} />
            </Field>
            <Field label={labels.deliveryFee}>
              <input className={INPUT} type="number" inputMode="decimal" value={f.delivery_fee}
                onChange={(e) => set('delivery_fee', Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex items-baseline justify-between border-t border-edge pt-3">
            <span className="text-sm">{labels.grandTotal}</span>
            <span className="text-xl font-semibold tabular-nums">{fmt(money.grand)} MMK</span>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <div className="label">{labels.payment}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.payment}>
              <select className={INPUT} value={f.payment_method}
                onChange={(e) => set('payment_method', e.target.value)}>
                <option value="cod">{labels.cod}</option>
                <option value="transfer">{labels.transfer}</option>
                <option value="prepaid">{labels.prepaid}</option>
              </select>
            </Field>
            <Field label={labels.advance}>
              <input className={INPUT} type="number" inputMode="decimal" value={f.advance_payment}
                onChange={(e) => set('advance_payment', Number(e.target.value))} />
            </Field>
            <Field label={labels.deliveryMethod}>
              <input className={INPUT} placeholder={labels.deliveryPh} value={f.delivery_method}
                onChange={(e) => set('delivery_method', e.target.value)} />
            </Field>
            <Field label={labels.orderDate}>
              <input className={INPUT} type="date" value={f.order_date}
                onChange={(e) => set('order_date', e.target.value)} />
            </Field>
          </div>
          <Field label={labels.status}>
            <select className={INPUT} value={f.status}
              onChange={(e) => set('status', e.target.value)}>
              {Object.entries(labels.statuses).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label={labels.note}>
            <textarea className={INPUT} rows={2} placeholder={labels.notePh} value={f.note}
              onChange={(e) => set('note', e.target.value)} />
          </Field>
        </section>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? labels.saving : labels.save}
        </button>
        {err && <span className="text-sm text-bad">{err}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
