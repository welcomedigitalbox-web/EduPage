'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand';

export function CustomerFilters({
  initial, labels, stages,
}: {
  initial: { q: string; stage: string; source: string };
  labels: { search: string; allStages: string; allSources: string; fromAd: string; organic: string };
  stages: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);

  function go(next: Partial<{ q: string; stage: string; source: string }>) {
    const merged = { ...initial, q, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/customers?${params}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        className={`${INPUT} min-w-[16rem] flex-1`} value={q} placeholder={labels.search}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') go({}); }}
      />
      <select className={INPUT} value={initial.stage} onChange={(e) => go({ stage: e.target.value })}>
        <option value="">{labels.allStages}</option>
        {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select className={INPUT} value={initial.source} onChange={(e) => go({ source: e.target.value })}>
        <option value="">{labels.allSources}</option>
        <option value="ad">{labels.fromAd}</option>
        <option value="organic">{labels.organic}</option>
      </select>
    </div>
  );
}

export function ProfileEditor({
  contactId, initial, labels,
}: {
  contactId: string;
  initial: { tags: string[]; notes: string; phone: string };
  labels: {
    edit: string; tagsPh: string; notesPh: string; phone: string;
    save: string; cancel: string; saved: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [notes, setNotes] = useState(initial.notes);
  const [phone, setPhone] = useState(initial.phone);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!open) {
    return <button className="btn text-xs" onClick={() => setOpen(true)}>{labels.edit}</button>;
  }

  return (
    <div className="w-64 space-y-2 rounded-lg border border-edge bg-panel p-2">
      <input className={`${INPUT} w-full`} placeholder={labels.phone}
        value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className={`${INPUT} w-full`} placeholder={labels.tagsPh}
        value={tags} onChange={(e) => setTags(e.target.value)} />
      <textarea className={`${INPUT} w-full`} rows={3} placeholder={labels.notesPh}
        value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="btn-primary text-xs" disabled={busy} onClick={async () => {
          setBusy(true);
          await fetch(`/api/contacts/${contactId}/profile`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tags: tags.split(','), notes, phone }),
          });
          setBusy(false); setSaved(true); setOpen(false); router.refresh();
        }}>{labels.save}</button>
        <button className="btn text-xs" onClick={() => setOpen(false)}>{labels.cancel}</button>
        {saved && <span className="text-[11px] text-good">{labels.saved}</span>}
      </div>
    </div>
  );
}
