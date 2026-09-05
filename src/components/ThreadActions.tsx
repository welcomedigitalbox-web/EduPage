'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadStage } from '@/lib/types';

export function ReplyBox({
  conversationId, labels,
}: {
  conversationId: string;
  labels: { placeholder: string; send: string; hint: string; failed: string };
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function send() {
    if (!text.trim()) return;
    setErr(null);
    const res = await fetch(`/api/conversations/${conversationId}/reply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) { setErr(labels.failed); return; }
    setText('');
    start(() => router.refresh());
  }

  return (
    <div className="border-t border-edge p-3">
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder={labels.placeholder}
        className="w-full resize-none rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">{err ?? labels.hint}</span>
        <button className="btn-primary" onClick={send} disabled={pending || !text.trim()}>{labels.send}</button>
      </div>
    </div>
  );
}

export function StagePicker({
  contactId, stage, options,
}: { contactId: string; stage: LeadStage; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <select
      value={stage} disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        await fetch(`/api/contacts/${contactId}/stage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stage: e.target.value }),
        });
        setBusy(false); router.refresh();
      }}
      className="rounded-lg border border-edge bg-panel px-2 py-1 text-xs">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function StatusButtons({
  conversationId, labels,
}: { conversationId: string; labels: { bot: string; mine: string; close: string } }) {
  const router = useRouter();
  async function set(status: string) {
    await fetch(`/api/conversations/${conversationId}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <button className="btn" onClick={() => set('bot_handling')}>{labels.bot}</button>
      <button className="btn" onClick={() => set('human_handling')}>{labels.mine}</button>
      <button className="btn" onClick={() => set('closed')}>{labels.close}</button>
    </div>
  );
}

interface PosProduct {
  product_id: string; variant_id: string | null; display_name: string;
  price: number; stock_qty: number; sku: string | null;
  by_store: Record<string, number>;
}
interface Store { id: string; name: string; region: string | null }
interface DraftLine {
  product_id: string; variant_id: string | null; product_name: string;
  qty: number; unit_price: number;
}

/** The shop in the customer's city that can actually cover the basket. */
function autoStore(stores: Store[], address: string, lines: DraftLine[], products: PosProduct[]): string {
  const stockFor = (l: DraftLine, storeId: string) => {
    const p = products.find(
      (x) => x.product_id === l.product_id && x.variant_id === l.variant_id
    );
    return p?.by_store?.[storeId] ?? 0;
  };
  const covers = (storeId: string) =>
    lines.length > 0 && lines.every((l) => stockFor(l, storeId) >= l.qty);

  const text = address.toLowerCase();
  const inCity = stores.filter((s) => s.region && text.includes(s.region.toLowerCase()));
  return (
    inCity.find((s) => covers(s.id))?.id ??
    stores.find((s) => covers(s.id))?.id ??
    inCity[0]?.id ??
    stores[0]?.id ??
    ''
  );
}

export function OrderButton({
  contactId, draft, labels,
}: {
  contactId: string;
  draft?: DraftLine[];
  labels: {
    open: string; prefilled: string; title: string; search: string; out: string;
    left: string; total: string; save: string; cancel: string; failed: string; note: string;
    store: string; storeAuto: string; stockHere: string; stockTotal: string; notEnough: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [address, setAddress] = useState('');
  const [touchedStore, setTouchedStore] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(draft ?? []);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openPanel() {
    setOpen(true);
    const res = await fetch(`/api/products?contact_id=${contactId}`);
    const j = await res.json();
    setProducts(j.products ?? []);
    setStores(j.stores ?? []);
    setAddress(j.contact?.address ?? '');
    setStoreId(autoStore(j.stores ?? [], j.contact?.address ?? '', draft ?? [], j.products ?? []));
  }

  // Re-route as the basket changes, until a person overrides the choice.
  function retarget(next: DraftLine[]) {
    if (!touchedStore) setStoreId(autoStore(stores, address, next, products));
  }

  function add(p: PosProduct) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product_id === p.product_id && l.variant_id === p.variant_id);
      const next = i >= 0
        ? prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, {
            product_id: p.product_id, variant_id: p.variant_id,
            product_name: p.display_name, qty: 1, unit_price: p.price,
          }];
      retarget(next);
      return next;
    });
    setSearch('');
  }

  const stockAt = (l: DraftLine) => {
    const p = products.find((x) => x.product_id === l.product_id && x.variant_id === l.variant_id);
    return p?.by_store?.[storeId] ?? 0;
  };
  const short = lines.filter((l) => stockAt(l) < l.qty);

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const matches = search
    ? products.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  if (!open) {
    return (
      <button className="btn-primary w-full" onClick={openPanel}>
        {labels.open}{draft?.length ? labels.prefilled : ''}
      </button>
    );
  }

  return (
    <div className="card space-y-2 p-3">
      <div className="label">{labels.title}</div>

      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder={labels.search}
        className="w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand" />
      {matches.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-edge">
          {matches.map((p) => (
            <button key={`${p.product_id}:${p.variant_id}`} onClick={() => add(p)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-edge">
              <span>{p.display_name}</span>
              <span className={p.stock_qty <= 0 ? 'text-bad' : 'text-muted'}>
                {p.price.toLocaleString()} · {p.stock_qty <= 0
                  ? labels.out
                  : labels.stockTotal.replace('{n}', String(p.stock_qty))}
              </span>
            </button>
          ))}
        </div>
      )}

      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate">
            {l.product_name}
            <span className={`ml-1 ${stockAt(l) < l.qty ? 'text-bad' : 'text-muted'}`}>
              ({labels.stockHere.replace('{n}', String(stockAt(l)))})
            </span>
          </span>
          <input type="number" min={1} value={l.qty}
            onChange={(e) => setLines((p) => {
              const next = p.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 1 } : x);
              retarget(next);
              return next;
            })}
            className="w-14 rounded border border-edge bg-ink px-1 py-0.5 text-right" />
          <span className="w-24 text-right tabular-nums">{(l.qty * l.unit_price).toLocaleString()}</span>
          <button className="text-muted hover:text-bad"
            onClick={() => setLines((p) => {
              const next = p.filter((_, j) => j !== i);
              retarget(next);
              return next;
            })}>✕</button>
        </div>
      ))}

      <div>
        <div className="label mb-1">{labels.store}</div>
        <select
          className="w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand"
          value={storeId}
          onChange={(e) => { setStoreId(e.target.value); setTouchedStore(true); }}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.region ? ` · ${s.region}` : ''}
            </option>
          ))}
        </select>
        {!touchedStore && address && <p className="mt-1 text-[11px] text-muted">{labels.storeAuto}</p>}
        {short.length > 0 && <p className="mt-1 text-[11px] text-warn">{labels.notEnough}</p>}
      </div>

      <div className="flex justify-between border-t border-edge pt-2 text-sm">
        <span className="text-muted">{labels.total}</span>
        <span className="tabular-nums">{total.toLocaleString()} MMK</span>
      </div>
      {err && <p className="text-xs text-bad">{err}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !lines.length} onClick={async () => {
          setBusy(true); setErr(null);
          const res = await fetch('/api/orders', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contact_id: contactId, lines, store_id: storeId }),
          });
          setBusy(false);
          if (!res.ok) { setErr(labels.failed); return; }
          setOpen(false); router.refresh();
        }}>{labels.save}</button>
        <button className="btn" onClick={() => setOpen(false)}>{labels.cancel}</button>
      </div>
      <p className="text-[11px] text-muted">{labels.note}</p>
    </div>
  );
}

export function FollowUpActions({
  id, labels,
}: { id: string; labels: { done: string; snooze: string; cancel: string } }) {
  const router = useRouter();
  async function act(action: string, hours?: number) {
    await fetch(`/api/followups/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, hours }),
    });
    router.refresh();
  }
  return (
    <div className="flex gap-1">
      <button className="btn text-xs" onClick={() => act('done')}>{labels.done}</button>
      <button className="btn text-xs" onClick={() => act('snooze', 24)}>{labels.snooze}</button>
      <button className="btn text-xs" onClick={() => act('cancel')}>{labels.cancel}</button>
    </div>
  );
}

/**
 * The full CRM form lives on the customer page — this is the way in from the
 * thread, so staff do not have to hunt for the same person twice.
 */
export function PosCustomerBox({
  contactId, customerId, labels,
}: {
  contactId: string;
  customerId: string | null;
  labels: { title: string; create: string; open: string; linked: string; notLinked: string };
}) {
  return (
    <div className="card space-y-2 p-3 text-sm">
      <div className="label">{labels.title}</div>
      <p className={`text-xs ${customerId ? 'text-good' : 'text-muted'}`}>
        {customerId ? labels.linked : labels.notLinked}
      </p>
      <a className="btn-primary block text-center text-xs" href={`/customers/${contactId}`}>
        {customerId ? labels.open : labels.create}
      </a>
    </div>
  );
}
