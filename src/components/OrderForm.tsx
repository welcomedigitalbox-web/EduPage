'use client';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  validateOrder, orderMoney, requiredAdvance, normalizePhone,
  type FieldKey,
} from '@/lib/order-rules';
import { paymentState } from '@/lib/order-payment';

const FIELD =
  'rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';
const INPUT = `w-full ${FIELD}`;
const BAD = 'border-bad focus:border-bad';

export interface Line {
  barcode: string; description: string; unit_price: number | ''; qty: number | '';
  product_id?: string | null; variant_id?: string | null;
}

export interface OrderFormLabels {
  customer: string; name: string; phone: string; city: string; address: string;
  shop: string; pickShop: string; items: string; barcode: string; description: string;
  unitPrice: string; qty: string; lineTotal: string; addLine: string; removeLine: string;
  money: string; subtotal: string; discount: string; deliveryFee: string; grandTotal: string;
  payment: string; pendingPay: string; cod: string; deposit: string; transfer: string;
  advance: string;
  codDue: string; fixFirst: string; channel: string; pickChannel: string;
  payRef: string; payRefPh: string;
  slip: string; slipAdd: string; slipView: string; slipRemove: string; uploading: string;
  seller: string; pickSeller: string;
  srcChannel: string; pickSrc: string; discAmount: string; discPercent: string;
  saleType: string; retail: string; wholesale: string;
  paid: string; partial: string; unpaid: string;
  deliveryMethod: string; deliveryPh: string; orderDate: string; status: string;
  note: string; notePh: string; save: string; saving: string; failed: string;
  errors: Record<string, string>;
  statuses: Record<string, string>;
}

export function OrderForm({
  shops, channels, sellers, srcChannels, initial, contactId, conversationId, orderId, labels,
}: {
  shops: { id: string; name: string; region: string | null }[];
  channels: { id: string; name: string; kind: string }[];
  sellers: { id: string; name: string }[];
  srcChannels: { id: string; name: string }[];
  initial: Partial<{
    customer_name: string; phone: string; city: string; delivery_address: string;
    shop_id: string; order_date: string; delivery_method: string; payment_method: string;
    payment_channel_id: string; payment_ref: string; payment_slip_url: string;
    payment_slips: string[];
    sales_person_id: string; order_channel_id: string; sale_type: string;
    discount_type: string; discount_value: number;
    advance_payment: number; delivery_fee: number; discount: number; status: string;
    note: string; items: Line[];
  }>;
  contactId?: string | null;
  conversationId?: string | null;
  orderId?: string;
  labels: OrderFormLabels;
}) {
  const router = useRouter();
  // Computed once at module scope would still differ between the server's UTC
  // render and the browser's, so the date is resolved on the client.
  const [today, setToday] = useState(initial.order_date ?? '');
  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' }));
  }, []);

  const [f, setF] = useState({
    customer_name: initial.customer_name ?? '',
    phone: initial.phone ?? '',
    city: initial.city ?? '',
    delivery_address: initial.delivery_address ?? '',
    shop_id: initial.shop_id ?? '',
    order_date: initial.order_date ?? '',
    delivery_method: initial.delivery_method ?? '',
    payment_method: initial.payment_method ?? 'cod',
    payment_channel_id: initial.payment_channel_id ?? '',
    payment_ref: initial.payment_ref ?? '',
    payment_slips: initial.payment_slips?.length
      ? initial.payment_slips
      : (initial.payment_slip_url ? [initial.payment_slip_url] : []) as string[],
    sales_person_id: initial.sales_person_id ?? '',
    order_channel_id: initial.order_channel_id ?? '',
    sale_type: initial.sale_type ?? 'retail',
    discount_type: initial.discount_type ?? 'amount',
    discount_value: initial.discount_value ?? initial.discount ?? 0,
    advance_payment: initial.advance_payment ?? 0,
    delivery_fee: initial.delivery_fee ?? 0,
    discount: initial.discount ?? 0,
    status: initial.status ?? 'pending',
    note: initial.note ?? '',
  });
  const [lines, setLines] = useState<Line[]>(
    initial.items?.length
      ? initial.items
      : [{ barcode: '', description: '', unit_price: '', qty: 1, product_id: null, variant_id: null }]
  );
  type Cat = { product_id: string; variant_id: string | null; label: string; sku: string; price: number };
  const [catalog, setCatalog] = useState<Cat[]>([]);
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((j) => setCatalog(j.items ?? []))
      .catch(() => setCatalog([]));
  }, []);

  // Typing or scanning a sku fills the line from the POS catalogue. A line
  // with no product behind it still sells, it just moves no stock.
  function pickItem(i: number, code: string) {
    const hit = catalog.find((c) => c.sku === code);
    if (!hit) {
      setLine(i, { barcode: code, product_id: null, variant_id: null });
      return;
    }
    setLine(i, {
      barcode: code,
      product_id: hit.product_id,
      variant_id: hit.variant_id,
      description: hit.label,
      unit_price: hit.price,
    });
  }

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Errors stay hidden until the first save attempt: flagging an empty form
  // the moment it opens is noise, not help.
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (today) setF((p) => (p.order_date ? p : { ...p, order_date: today }));
  }, [today]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const money = useMemo(
    () => orderMoney({
      items: lines, delivery_fee: f.delivery_fee, advance_payment: f.advance_payment,
      discount_type: f.discount_type, discount_value: f.discount_value,
    }),
    [lines, f.discount_type, f.discount_value, f.delivery_fee, f.advance_payment]
  );

  const errs = useMemo(
    () => validateOrder({ ...f, items: lines }),
    [f, lines]
  );
  const show = (k: FieldKey) =>
    touched && errs[k] ? labels.errors[errs[k]!] ?? errs[k]! : null;

  const fmt = (n: number) => n.toLocaleString();

  /** Picking a method fills in the advance it implies, so the common cases
   *  never trip the validation at all. */
  function pickPayment(method: string) {
    const need = requiredAdvance(method, money.grand_total);
    setF((p) => {
      const advance = need !== null ? need : p.advance_payment;
      return {
        ...p, payment_method: method, advance_payment: advance,
        // COD takes no money up front, so a wallet on the order would be a lie.
        payment_channel_id: advance > 0 ? p.payment_channel_id : '',
        payment_ref: advance > 0 ? p.payment_ref : '',
        payment_slips: advance > 0 ? p.payment_slips : [],
      };
    });
  }

  // For COD and full transfer the advance is not a free number — it follows
  // the total. Setting it once when the method was picked left it stale the
  // moment a line was added, which is how a transfer order ended up showing
  // nothing received and hiding the wallet and slip fields.
  useEffect(() => {
    const need = requiredAdvance(f.payment_method, money.grand_total);
    if (need !== null && need !== f.advance_payment) {
      setF((p) => ({ ...p, advance_payment: need }));
    }
  }, [f.payment_method, money.grand_total, f.advance_payment]);

  const advanceLocked = f.payment_method !== 'deposit';
  // Anything but COD means money is expected, so ask where it came from and
  // for the slip — without waiting for an amount to appear first.
  const expectsPayment = f.payment_method === 'deposit' || f.payment_method === 'transfer';

  /** Slips go to the same store the inbox uses for its attachments, so there
   *  is one place to look for customer-supplied images. Several at once: a
   *  customer paying in two transfers sends two screenshots. */
  async function uploadSlips(files: FileList) {
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
    if (added.length) setF((p) => ({ ...p, payment_slips: [...p.payment_slips, ...added] }));
  }

  async function save() {
    setTouched(true);
    if (Object.keys(errs).length) { setErr(labels.fixFirst); return; }
    setBusy(true); setErr(null);
    const res = await fetch('/api/online-orders', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...f,
        phone: normalizePhone(f.phone),
        id: orderId,
        contact_id: contactId ?? null,
        conversation_id: conversationId ?? null,
        items: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            barcode: l.barcode || null,
            product_id: l.product_id ?? null,
            variant_id: l.variant_id ?? null,
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
          <Field label={labels.name} err={show('customer_name')}>
            <input className={`${INPUT} ${show('customer_name') ? BAD : ''}`}
              value={f.customer_name}
              onChange={(e) => set('customer_name', e.target.value)} />
          </Field>
          <Field label={labels.phone} err={show('phone')}>
            <input className={`${INPUT} ${show('phone') ? BAD : ''}`}
              inputMode="tel" placeholder="09xxxxxxxxx" value={f.phone}
              onChange={(e) => set('phone', e.target.value)}
              onBlur={() => set('phone', normalizePhone(f.phone))} />
          </Field>
          <Field label={labels.city}>
            <input className={INPUT} value={f.city}
              onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label={labels.shop} err={show('shop_id')}>
            <select className={`${INPUT} ${show('shop_id') ? BAD : ''}`} value={f.shop_id}
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
        <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.srcChannel} err={show('order_channel_id')}>
          <select className={`${INPUT} ${show('order_channel_id') ? BAD : ''}`}
            value={f.order_channel_id}
            onChange={(e) => set('order_channel_id', e.target.value)}>
            <option value="">{labels.pickSrc}</option>
            {srcChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={labels.seller} err={show('sales_person_id')}>
          <select className={`${INPUT} ${show('sales_person_id') ? BAD : ''}`}
            value={f.sales_person_id}
            onChange={(e) => set('sales_person_id', e.target.value)}>
            <option value="">{labels.pickSeller}</option>
            {sellers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        </div>
        <Field label={labels.saleType}>
          <select className={INPUT} value={f.sale_type}
            onChange={(e) => set('sale_type', e.target.value)}>
            <option value="retail">{labels.retail}</option>
            <option value="wholesale">{labels.wholesale}</option>
          </select>
        </Field>
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
                list="pos-catalog"
                onChange={(e) => pickItem(i, e.target.value)} />
              <input className={INPUT} placeholder={labels.description} value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={INPUT} type="number" min={0} step="any" inputMode="decimal"
                placeholder={labels.unitPrice} value={l.unit_price}
                onChange={(e) => setLine(i, { unit_price: e.target.value === '' ? '' : Number(e.target.value) })} />
              <input className={INPUT} type="number" min={0} step="any" inputMode="decimal"
                placeholder={labels.qty} value={l.qty}
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
          onClick={() => setLines((p) => [...p, { barcode: '', description: '', unit_price: '', qty: 1, product_id: null, variant_id: null }])}>
          + {labels.addLine}
        </button>
        <datalist id="pos-catalog">
          {catalog.map((c) => (
            <option key={c.product_id + ':' + (c.variant_id ?? '')} value={c.sku}>{c.label}</option>
          ))}
        </datalist>

        {show('items') && <p className="mt-2 text-xs text-bad">{show('items')}</p>}
      </section>

      {/* money + delivery */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <div className="label">{labels.money}</div>
          <Row k={labels.subtotal} v={fmt(money.subtotal)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.discount} err={show('discount_value')}>
              {/* w-full on both halves made them fight for the row; the number
                  flexes and the unit keeps a fixed width instead. */}
              <div className="flex gap-1">
                <input
                  className={`min-w-0 flex-1 ${FIELD} ${show('discount_value') ? BAD : ''}`}
                  type="number" min={0} step="any" inputMode="decimal" value={f.discount_value}
                  onChange={(e) => set('discount_value', Number(e.target.value))} />
                <select className={`w-16 shrink-0 ${FIELD}`} value={f.discount_type}
                  onChange={(e) => set('discount_type', e.target.value)}>
                  <option value="amount">{labels.discAmount}</option>
                  <option value="percent">{labels.discPercent}</option>
                </select>
              </div>
              {f.discount_type === 'percent' && money.discount > 0 && (
                <span className="mt-1 block text-[11px] text-muted">
                  −{fmt(money.discount)} MMK
                </span>
              )}
            </Field>
            <Field label={labels.deliveryFee} err={show('delivery_fee')}>
              <input className={`${INPUT} ${show('delivery_fee') ? BAD : ''}`} type="number"
                min={0} step="any" inputMode="decimal" value={f.delivery_fee}
                onChange={(e) => set('delivery_fee', Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex items-baseline justify-between border-t border-edge pt-3">
            <span className="text-sm">{labels.grandTotal}</span>
            <span className="text-xl font-semibold tabular-nums">{fmt(money.grand_total)} MMK</span>
          </div>
          {money.advance > 0 && (
            <div className="flex items-baseline justify-between text-sm text-muted">
              <span>{labels.codDue}</span>
              <span className="tabular-nums">{fmt(money.cod_due)} MMK</span>
            </div>
          )}
        </section>

        <section className="card space-y-3 p-4">
          {/* What this order will be the moment it is saved — staff should not
              have to open it again to find out. */}
          {(() => {
            const st = paymentState(money.grand_total, money.advance);
            const tone = st === 'paid' ? 'border-good text-good'
              : st === 'partial' ? 'border-brand text-brand' : 'border-bad text-bad';
            const text = st === 'paid' ? labels.paid
              : st === 'partial' ? labels.partial : labels.unpaid;
            return (
              <div className="flex items-baseline justify-between gap-2">
                <div className="label">{labels.payment}</div>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${tone}`}>{text}</span>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.payment}>
              <select className={INPUT} value={f.payment_method}
                onChange={(e) => pickPayment(e.target.value)}>
                <option value="pending">{labels.pendingPay}</option>
                <option value="cod">{labels.cod}</option>
                <option value="deposit">{labels.deposit}</option>
                <option value="transfer">{labels.transfer}</option>
              </select>
            </Field>
            <Field label={labels.advance} err={show('advance_payment')}>
              <input
                className={`${INPUT} ${show('advance_payment') ? BAD : ''} ${advanceLocked ? 'opacity-60' : ''}`}
                type="number" min={0} step="any" inputMode="decimal"
                readOnly={advanceLocked}
                value={f.advance_payment}
                onChange={(e) => set('advance_payment', Number(e.target.value))} />
            </Field>
            <Field label={labels.deliveryMethod}>
              <input className={INPUT} placeholder={labels.deliveryPh} value={f.delivery_method}
                onChange={(e) => set('delivery_method', e.target.value)} />
            </Field>
            <Field label={labels.orderDate} err={show('order_date')}>
              <input className={`${INPUT} ${show('order_date') ? BAD : ''}`} type="date"
                max={today} value={f.order_date}
                onChange={(e) => set('order_date', e.target.value)} />
            </Field>
          </div>
          {expectsPayment && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.channel} err={show('payment_channel_id')}>
                <select
                  className={`${INPUT} ${show('payment_channel_id') ? BAD : ''}`}
                  value={f.payment_channel_id}
                  onChange={(e) => set('payment_channel_id', e.target.value)}>
                  <option value="">{labels.pickChannel}</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={labels.payRef}>
                <input className={INPUT} placeholder={labels.payRefPh} value={f.payment_ref}
                  onChange={(e) => set('payment_ref', e.target.value)} />
              </Field>
              <div className="col-span-2">
                <span className="mb-1 block text-[11px] text-muted">{labels.slip}</span>
                <div className="space-y-2">
                  {f.payment_slips.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {f.payment_slips.map((url, i) => (
                        <div key={url} className="relative">
                          <a href={url} target="_blank" rel="noreferrer"
                             className="block h-20 w-20 overflow-hidden rounded-lg border border-edge">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`${labels.slip} ${i + 1}`}
                                 className="h-full w-full object-cover" />
                          </a>
                          <button
                            className="absolute -right-1.5 -top-1.5 rounded-full border border-edge bg-panel px-1.5 text-[10px]"
                            aria-label={labels.slipRemove}
                            onClick={() => setF((p) => ({
                              ...p, payment_slips: p.payment_slips.filter((u) => u !== url),
                            }))}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className={`btn inline-block cursor-pointer text-xs ${
                    show('payment_slip_url') ? 'border-bad text-bad' : ''}`}>
                    {uploading ? labels.uploading : labels.slipAdd}
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) uploadSlips(e.target.files);
                        e.target.value = '';
                      }} />
                  </label>
                </div>
                {show('payment_slip_url') && (
                  <p className="mt-1 text-[11px] text-bad">{show('payment_slip_url')}</p>
                )}
              </div>
            </div>
          )}

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

function Field({ label, err, children }: {
  label: string; err?: string | null; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
      {err && <span className="mt-1 block text-[11px] text-bad">{err}</span>}
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
