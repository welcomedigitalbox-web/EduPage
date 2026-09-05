'use client';
import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export interface RangeLabels {
  today: string; yesterday: string; d7: string; d30: string; d90: string;
  month: string; lastMonth: string; custom: string; apply: string;
  compare: string; from: string; to: string;
}

const PRESETS: [key: string, label: keyof RangeLabels][] = [
  ['today', 'today'], ['yesterday', 'yesterday'], ['7d', 'd7'], ['30d', 'd30'],
  ['90d', 'd90'], ['month', 'month'], ['last_month', 'lastMonth'],
];

export function RangePicker({
  preset, since, until, compare, labels,
}: {
  preset: string; since: string; until: string; compare: boolean; labels: RangeLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(preset === 'custom');
  const [draft, setDraft] = useState({ since, until });

  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(sp.toString());
    // A preset and a custom window are mutually exclusive; clear the other.
    for (const [k, v] of Object.entries(next)) v == null ? q.delete(k) : q.set(k, v);
    router.push(`${pathname}?${q.toString()}`);
  }

  const chip = (active: boolean) =>
    `btn text-xs ${active ? 'border-brand text-brand' : ''}`;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {PRESETS.map(([key, lab]) => (
          <button key={key} className={chip(preset === key)}
            onClick={() => { setOpen(false); go({ preset: key, since: null, until: null }); }}>
            {labels[lab]}
          </button>
        ))}
        <button className={chip(preset === 'custom')} onClick={() => setOpen((v) => !v)}>
          {labels.custom}
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-edge bg-panel p-2">
          <label className="text-[11px] text-muted">
            {labels.from}
            <input type="date" value={draft.since}
              onChange={(e) => setDraft({ ...draft, since: e.target.value })}
              className="ml-1 rounded border border-edge bg-ink p-1 text-xs text-white" />
          </label>
          <label className="text-[11px] text-muted">
            {labels.to}
            <input type="date" value={draft.until}
              onChange={(e) => setDraft({ ...draft, until: e.target.value })}
              className="ml-1 rounded border border-edge bg-ink p-1 text-xs text-white" />
          </label>
          <button className="btn-primary text-xs"
            onClick={() => go({ preset: 'custom', since: draft.since, until: draft.until })}>
            {labels.apply}
          </button>
        </div>
      )}

      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={compare}
          onChange={(e) => go({ compare: e.target.checked ? '1' : '0' })} />
        {labels.compare}
      </label>
    </div>
  );
}
