'use client';
import { useMemo, useState } from 'react';

export type Cat = {
  product_id: string; variant_id: string | null;
  label: string; sku: string; price: number;
};

/** Staff type the product name, not a code - so the line is only linked to a
 *  product once someone picks it from this list. An unlinked line still
 *  sells, it just moves no stock, and the marker says so. */
export function ItemPicker({ catalog, value, onPick, placeholder, linked }: {
  catalog: Cat[];
  value: string;
  onPick: (c: Cat | null, text: string) => void;
  placeholder: string;
  linked: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (k.length < 2) return [];
    return catalog
      .filter((c) =>
        c.label.toLowerCase().includes(k) || (c.sku ?? '').toLowerCase().includes(k))
      .slice(0, 20);
  }, [q, catalog]);

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border border-edge bg-ink p-2 text-sm outline-none focus:border-brand"
        placeholder={placeholder}
        value={open ? q : value}
        onFocus={() => { setQ(value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); onPick(null, e.target.value); }} />
      {!linked && value.trim() !== '' && (
        <span className="pointer-events-none absolute right-2 top-2.5 text-[10px] text-bad">
          no product
        </span>
      )}
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-edge bg-panel text-sm shadow-lg">
          {hits.map((c) => (
            <li key={c.product_id + ':' + (c.variant_id ?? '')}>
              <button type="button"
                className="block w-full px-2 py-1.5 text-left hover:bg-ink"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(c, c.label); setOpen(false); }}>
                <span>{c.label}</span>
                {c.sku ? <span className="ml-2 text-[11px] text-muted">{c.sku}</span> : null}
                <span className="ml-2 text-[11px] text-muted">{c.price.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
