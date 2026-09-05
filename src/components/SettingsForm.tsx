'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BotSettings } from '@/lib/types';

const INPUT =
  'w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export interface SettingsLabels {
  enabled: string; business: string; store: string; storeHint: string; pick: string;
  stores: string; storesHint: string; defaultStore: string;
  quoteStock: string; language: string; langMy: string; langEn: string; langMixed: string;
  persona: string; handoffMsg: string; handoff: string; minConf: string; maxTurns: string;
  followupHours: string; ghostHours: string; adCurrency: string; fxRate: string;
  save: string; saved: string;
}

export function SettingsForm({
  initial, stores, labels,
}: {
  initial: BotSettings;
  stores: { id: string; name: string; region: string | null }[];
  labels: SettingsLabels;
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function set<K extends keyof BotSettings>(k: K, v: BotSettings[K]) {
    setS((p) => ({ ...p, [k]: v })); setSaved(false);
  }

  return (
    <div className="card space-y-4 p-4">
      <label className="flex items-center justify-between">
        <span className="text-sm">{labels.enabled}</span>
        <input type="checkbox" checked={s.is_enabled} onChange={(e) => set('is_enabled', e.target.checked)} />
      </label>

      <Field label={labels.business}>
        <input className={INPUT} value={s.business_name} onChange={(e) => set('business_name', e.target.value)} />
      </Field>

      <Field label={labels.stores}>
        <div className="space-y-1 rounded-lg border border-edge p-2">
          {stores.map((st) => {
            const on = (s.fulfilment_store_ids ?? []).includes(st.id);
            return (
              <label key={st.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox" checked={on}
                  onChange={(e) => {
                    const cur = new Set(s.fulfilment_store_ids ?? []);
                    if (e.target.checked) cur.add(st.id); else cur.delete(st.id);
                    set('fulfilment_store_ids', [...cur]);
                  }}
                />
                <span>{st.name}</span>
                {st.region && <span className="text-xs text-muted">· {st.region}</span>}
              </label>
            );
          })}
          {!stores.length && <p className="text-xs text-muted">{labels.pick}</p>}
        </div>
        <p className="mt-1 text-[11px] text-muted">{labels.storesHint}</p>
      </Field>

      <Field label={labels.defaultStore}>
        <select className={INPUT} value={s.default_store_id ?? ''}
          onChange={(e) => set('default_store_id', e.target.value || null)}>
          <option value="">{labels.pick}</option>
          {stores
            .filter((st) => (s.fulfilment_store_ids ?? []).includes(st.id))
            .map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      </Field>

      <label className="flex items-center justify-between">
        <span className="text-sm">{labels.quoteStock}</span>
        <input type="checkbox" checked={s.quote_stock} onChange={(e) => set('quote_stock', e.target.checked)} />
      </label>

      <Field label={labels.language}>
        <select className={INPUT} value={s.language} onChange={(e) => set('language', e.target.value)}>
          <option value="my">{labels.langMy}</option>
          <option value="en">{labels.langEn}</option>
          <option value="mixed">{labels.langMixed}</option>
        </select>
      </Field>

      <Field label={labels.persona}>
        <textarea className={INPUT} rows={2} value={s.persona} onChange={(e) => set('persona', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.adCurrency}>
          <input className={INPUT} value={s.ad_currency ?? 'USD'}
            onChange={(e) => set('ad_currency', e.target.value.toUpperCase().slice(0, 4))} />
        </Field>
        <Field label={labels.fxRate}>
          <input className={INPUT} type="number" value={s.mmk_per_usd ?? 4500}
            onChange={(e) => set('mmk_per_usd', Number(e.target.value))} />
        </Field>
      </div>

      <Field label={labels.handoffMsg}>
        <textarea className={INPUT} rows={2} value={s.handoff_message ?? ''}
          onChange={(e) => set('handoff_message', e.target.value)} />
      </Field>

      <Field label={labels.handoff}>
        <input className={INPUT} value={s.handoff_keywords.join(', ')}
          onChange={(e) => set('handoff_keywords', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.minConf.replace('{n}', String(s.min_confidence))}>
          <input type="range" min={0} max={1} step={0.05} value={s.min_confidence}
            onChange={(e) => set('min_confidence', Number(e.target.value))} className="w-full" />
        </Field>
        <Field label={labels.maxTurns}>
          <input type="number" className={INPUT} value={s.max_bot_turns}
            onChange={(e) => set('max_bot_turns', Number(e.target.value))} />
        </Field>
        <Field label={labels.followupHours}>
          <input type="number" className={INPUT} value={s.follow_up_hours}
            onChange={(e) => set('follow_up_hours', Number(e.target.value))} />
        </Field>
        <Field label={labels.ghostHours}>
          <input type="number" className={INPUT} value={s.ghost_hours}
            onChange={(e) => set('ghost_hours', Number(e.target.value))} />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={async () => {
          await fetch('/api/settings', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s),
          });
          setSaved(true); router.refresh();
        }}>{labels.save}</button>
        {saved && <span className="text-sm text-good">{labels.saved}</span>}
      </div>
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

export function KbEditor({
  items, labels,
}: {
  items: { id: string; kind: string; title: string; body: string }[];
  labels: {
    add: string; policy: string; faq: string; titlePh: string; bodyPh: string;
    addBtn: string; del: string; empty: string;
    edit: string; save: string; cancel: string;
  };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ kind: 'policy', title: '', body: '' });
  const [editing, setEditing] = useState<null | { id: string; kind: string; title: string; body: string }>(null);

  async function saveEdit() {
    if (!editing || !editing.title || !editing.body) return;
    await fetch('/api/kb', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editing),
    });
    setEditing(null);
    router.refresh();
  }

  async function save() {
    if (!draft.title || !draft.body) return;
    await fetch('/api/kb', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
    });
    setDraft({ kind: 'policy', title: '', body: '' });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <div className="label">{labels.add}</div>
        <div className="flex gap-2">
          <select className={INPUT + ' w-32'} value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            <option value="policy">{labels.policy}</option>
            <option value="faq">{labels.faq}</option>
          </select>
          <input className={INPUT} placeholder={labels.titlePh} value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
        <textarea className={INPUT} rows={3} placeholder={labels.bodyPh}
          value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <button className="btn-primary" onClick={save}>{labels.addBtn}</button>
      </div>

      <div className="card divide-y divide-edge">
        {items.map((k) => (
          editing?.id === k.id ? (
            <div key={k.id} className="space-y-2 p-3">
              <input className={INPUT} value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <textarea className={INPUT} rows={4} value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn-primary text-xs" onClick={saveEdit}>{labels.save}</button>
                <button className="btn text-xs" onClick={() => setEditing(null)}>{labels.cancel}</button>
              </div>
            </div>
          ) : (
          <div key={k.id} className="flex items-start justify-between gap-4 p-3">
            <div className="min-w-0">
              <div className="text-sm">
                <span className="mr-2 rounded bg-edge px-1.5 py-0.5 text-[11px] text-muted">{k.kind}</span>
                {k.title}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-xs text-muted">{k.body}</div>
            </div>
            <div className="flex shrink-0 gap-2">
            <button className="btn text-xs" onClick={() => setEditing({ ...k })}>{labels.edit}</button>
            <button className="btn text-xs" onClick={async () => {
              await fetch('/api/kb', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ delete_id: k.id }),
              });
              router.refresh();
            }}>{labels.del}</button>
            </div>
          </div>
          )
        ))}
        {!items.length && <div className="p-6 text-center text-sm text-muted">{labels.empty}</div>}
      </div>
    </div>
  );
}
