'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { STAGE_LABEL, type LeadStage } from '@/lib/types';

export function ReplyBox({ conversationId }: { conversationId: string }) {
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
    if (!res.ok) { setErr((await res.json()).error ?? 'ပို့မရပါ'); return; }
    setText('');
    start(() => router.refresh());
  }

  return (
    <div className="border-t border-edge p-3">
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="လူကိုယ်တိုင် ပြန်ဖြေရန်… (ဒီကနေပို့လိုက်ရင် bot ရပ်သွားပါမယ်)"
        className="w-full resize-none rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">{err ?? '⌘/Ctrl + Enter နဲ့ ပို့နိုင်'}</span>
        <button className="btn-primary" onClick={send} disabled={pending || !text.trim()}>ပို့မယ်</button>
      </div>
    </div>
  );
}

export function StagePicker({ contactId, stage }: { contactId: string; stage: LeadStage }) {
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
      {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function StatusButtons({ conversationId }: { conversationId: string }) {
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
      <button className="btn" onClick={() => set('bot_handling')}>Bot ပြန်ပေးမယ်</button>
      <button className="btn" onClick={() => set('human_handling')}>ငါကိုင်မယ်</button>
      <button className="btn" onClick={() => set('closed')}>ပိတ်မယ်</button>
    </div>
  );
}

interface PosProduct {
  product_id: string; variant_id: string | null; display_name: string;
  price: number; stock_qty: number; sku: string | null;
}
interface DraftLine {
  product_id: string; variant_id: string | null; product_name: string;
  qty: number; unit_price: number;
}

/** Writes a real POS order. The basket the AI drafted is pre-filled, but a
 *  person always edits and confirms it before it becomes a sale. */
export function OrderButton({
  contactId, draft,
}: { contactId: string; draft?: DraftLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [lines, setLines] = useState<DraftLine[]>(draft ?? []);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openPanel() {
    setOpen(true);
    const res = await fetch('/api/products');
    const j = await res.json();
    setProducts(j.products ?? []);
  }

  function add(p: PosProduct) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product_id === p.product_id && l.variant_id === p.variant_id);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...prev, {
        product_id: p.product_id, variant_id: p.variant_id,
        product_name: p.display_name, qty: 1, unit_price: p.price,
      }];
    });
    setSearch('');
  }

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const matches = search
    ? products.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  if (!open) {
    return (
      <button className="btn-primary w-full" onClick={openPanel}>
        POS order ဖွင့်မယ်{draft?.length ? ` (${draft.length} မျိုး ကြိုဖြည့်ထား)` : ''}
      </button>
    );
  }

  return (
    <div className="card space-y-2 p-3">
      <div className="label">POS order အသစ်</div>

      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="ပစ္စည်းရှာမယ်…"
        className="w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand" />
      {matches.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-edge">
          {matches.map((p) => (
            <button key={`${p.product_id}:${p.variant_id}`} onClick={() => add(p)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-edge">
              <span>{p.display_name}</span>
              <span className={p.stock_qty <= 0 ? 'text-bad' : 'text-muted'}>
                {p.price.toLocaleString()} · {p.stock_qty <= 0 ? 'ကုန်' : `${p.stock_qty} ခု`}
              </span>
            </button>
          ))}
        </div>
      )}

      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate">{l.product_name}</span>
          <input type="number" min={1} value={l.qty}
            onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 1 } : x))}
            className="w-14 rounded border border-edge bg-ink px-1 py-0.5 text-right" />
          <span className="w-24 text-right tabular-nums">{(l.qty * l.unit_price).toLocaleString()}</span>
          <button className="text-muted hover:text-bad"
            onClick={() => setLines((p) => p.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}

      <div className="flex justify-between border-t border-edge pt-2 text-sm">
        <span className="text-muted">စုစုပေါင်း</span>
        <span className="tabular-nums">{total.toLocaleString()} MMK</span>
      </div>
      {err && <p className="text-xs text-bad">{err}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !lines.length} onClick={async () => {
          setBusy(true); setErr(null);
          const res = await fetch('/api/orders', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contact_id: contactId, lines }),
          });
          setBusy(false);
          if (!res.ok) { setErr((await res.json()).error ?? 'သိမ်းမရပါ'); return; }
          setOpen(false); router.refresh();
        }}>POS ထဲ သိမ်းမယ်</button>
        <button className="btn" onClick={() => setOpen(false)}>မလုပ်တော့</button>
      </div>
      <p className="text-[11px] text-muted">
        POS ရဲ့ Sale Order စာမျက်နှာမှာ &ldquo;pending&rdquo; အဖြစ် ဝင်သွားပါမယ်။ Stock က
        တကယ်ထုတ်ပေးမှသာ လျော့ပါမယ်။
      </p>
    </div>
  );
}

export function FollowUpActions({ id }: { id: string }) {
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
      <button className="btn text-xs" onClick={() => act('done')}>ပြီးပြီ</button>
      <button className="btn text-xs" onClick={() => act('snooze', 24)}>မနက်ဖြန်</button>
      <button className="btn text-xs" onClick={() => act('cancel')}>ဖျက်</button>
    </div>
  );
}
