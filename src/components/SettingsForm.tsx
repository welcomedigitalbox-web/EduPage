'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BotSettings } from '@/lib/types';

export function SettingsForm({ initial }: { initial: BotSettings }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function set<K extends keyof BotSettings>(k: K, v: BotSettings[K]) {
    setS((p) => ({ ...p, [k]: v })); setSaved(false);
  }

  return (
    <div className="card space-y-4 p-4">
      <label className="flex items-center justify-between">
        <span className="text-sm">Bot အလုပ်လုပ်နေမလား</span>
        <input type="checkbox" checked={s.is_enabled} onChange={(e) => set('is_enabled', e.target.checked)} />
      </label>

      <Field label="ဆိုင်နာမည်">
        <input className="inp" value={s.business_name} onChange={(e) => set('business_name', e.target.value)} />
      </Field>

      <Field label="ဘာသာစကား">
        <select className="inp" value={s.language} onChange={(e) => set('language', e.target.value)}>
          <option value="my">မြန်မာ</option>
          <option value="en">English</option>
          <option value="mixed">ဖောက်သည်သုံးတဲ့ ဘာသာအတိုင်း</option>
        </select>
      </Field>

      <Field label="Bot ရဲ့ စကားပြောပုံ (persona)">
        <textarea className="inp" rows={2} value={s.persona} onChange={(e) => set('persona', e.target.value)} />
      </Field>

      <Field label="လူ့ဆီ ချက်ချင်းလွှဲရမယ့် စကားလုံးများ (comma ခြား)">
        <input className="inp" value={s.handoff_keywords.join(', ')}
          onChange={(e) => set('handoff_keywords', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Bot အနည်းဆုံး ယုံကြည်မှု (${s.min_confidence})`}>
          <input type="range" min={0} max={1} step={0.05} value={s.min_confidence}
            onChange={(e) => set('min_confidence', Number(e.target.value))} className="w-full" />
        </Field>
        <Field label="Bot အများဆုံး ဖြေခွင့် (အကြိမ်)">
          <input type="number" className="inp" value={s.max_bot_turns}
            onChange={(e) => set('max_bot_turns', Number(e.target.value))} />
        </Field>
        <Field label="Follow-up စတင်ချိန် (နာရီ)">
          <input type="number" className="inp" value={s.follow_up_hours}
            onChange={(e) => set('follow_up_hours', Number(e.target.value))} />
        </Field>
        <Field label="ပျောက်သွားပြီလို့ သတ်မှတ်ချိန် (နာရီ)">
          <input type="number" className="inp" value={s.ghost_hours}
            onChange={(e) => set('ghost_hours', Number(e.target.value))} />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={async () => {
          await fetch('/api/settings', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s),
          });
          setSaved(true); router.refresh();
        }}>သိမ်းမယ်</button>
        {saved && <span className="text-sm text-good">သိမ်းပြီးပါပြီ</span>}
      </div>

      <style>{`.inp{width:100%;border-radius:.5rem;border:1px solid #262b35;background:#0f1115;padding:.5rem;font-size:.875rem;outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}

export function KbEditor({ items }: { items: { id: string; kind: string; title: string; body: string; price: number | null; in_stock: boolean | null }[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ kind: 'product', title: '', body: '', price: '' });

  async function save() {
    if (!draft.title || !draft.body) return;
    await fetch('/api/kb', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, price: draft.price ? Number(draft.price) : null }),
    });
    setDraft({ kind: 'product', title: '', body: '', price: '' });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <div className="label">အသစ်ထည့်မယ်</div>
        <div className="flex gap-2">
          <select className="inp2" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            <option value="product">ပစ္စည်း</option>
            <option value="faq">FAQ</option>
            <option value="policy">စည်းကမ်း</option>
          </select>
          <input className="inp2 flex-1" placeholder="ခေါင်းစဉ်" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="inp2 w-32" placeholder="ဈေးနှုန်း" value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        </div>
        <textarea className="inp2 w-full" rows={3} placeholder="အကြောင်းအရာ — bot က ဒီထဲကပဲ ဖြေပါလိမ့်မယ်"
          value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <button className="btn-primary" onClick={save}>ထည့်မယ်</button>
      </div>

      <div className="card divide-y divide-edge">
        {items.map((k) => (
          <div key={k.id} className="flex items-start justify-between gap-4 p-3">
            <div className="min-w-0">
              <div className="text-sm">
                <span className="mr-2 rounded bg-edge px-1.5 py-0.5 text-[11px] text-muted">{k.kind}</span>
                {k.title}
                {k.price != null && <span className="ml-2 text-xs text-muted">{k.price.toLocaleString()} MMK</span>}
                {k.in_stock === false && <span className="ml-2 text-xs text-bad">ပစ္စည်းကုန်</span>}
              </div>
              <div className="mt-1 text-xs text-muted">{k.body}</div>
            </div>
            <button className="btn text-xs" onClick={async () => {
              await fetch('/api/kb', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ delete_id: k.id }),
              });
              router.refresh();
            }}>ဖျက်</button>
          </div>
        ))}
        {!items.length && <div className="p-6 text-center text-sm text-muted">
          Knowledge base ဗလာဖြစ်နေရင် bot က ဘာမှ မဖြေဘဲ လူ့ဆီပဲ လွှဲပါလိမ့်မယ်
        </div>}
      </div>

      <style>{`.inp2{border-radius:.5rem;border:1px solid #262b35;background:#0f1115;padding:.5rem;font-size:.875rem;outline:none}`}</style>
    </div>
  );
}
