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

export function OrderButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>အရောင်းမှတ်မယ်</button>;
  return (
    <div className="card space-y-2 p-3">
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
        placeholder="စုစုပေါင်း ငွေပမာဏ (MMK)"
        className="w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ပစ္စည်း / မှတ်ချက်"
        className="w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand" />
      <div className="flex gap-2">
        <button className="btn-primary" onClick={async () => {
          await fetch('/api/orders', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contact_id: contactId, amount: Number(amount) || 0,
              items: note ? [{ name: note }] : [],
            }),
          });
          setOpen(false); router.refresh();
        }}>သိမ်းမယ်</button>
        <button className="btn" onClick={() => setOpen(false)}>မလုပ်တော့</button>
      </div>
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
