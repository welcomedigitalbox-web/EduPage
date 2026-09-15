'use client';
import { useEffect, useRef, useState } from 'react';

export interface Option { value: string; label: string }

/**
 * A filter that takes several values at once. It writes a comma-separated list
 * into one query parameter, so a filtered view is still just a URL somebody can
 * send to a colleague.
 */
export function MultiSelect({
  label, options, selected, onChange, allLabel,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const chosen = options.filter((o) => selected.includes(o.value));
  const summary = chosen.length === 0
    ? allLabel
    : chosen.length === 1 ? chosen[0].label : `${label} · ${chosen.length}`;

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${
          chosen.length ? 'border-brand text-brand' : 'border-edge text-muted'}`}>
        <span className="max-w-[10rem] truncate">{summary}</span>
        <span className="text-[9px]">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-edge bg-panel p-1 shadow-xl">
          {chosen.length > 0 && (
            <button className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted hover:bg-edge/50"
              onClick={() => onChange([])}>
              {allLabel}
            </button>
          )}
          {options.map((o) => (
            <label key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-edge/50">
              <input type="checkbox" checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted">—</div>
          )}
        </div>
      )}
    </div>
  );
}
