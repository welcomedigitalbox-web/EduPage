'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/** A column heading that sorts the table. Clicking the active column flips
 *  the direction; sorting always returns to page 1. */
export function SortHeader({
  field, label, active, dir, align = 'right',
}: {
  field: string; label: string; active: boolean; dir: 'asc' | 'desc';
  align?: 'left' | 'right';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function click() {
    const q = new URLSearchParams(sp.toString());
    q.set('sort', field);
    q.set('dir', active && dir === 'desc' ? 'asc' : 'desc');
    q.delete('page');
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <th className={`p-3 font-normal ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <button onClick={click}
        className={`inline-flex items-center gap-1 hover:text-white ${active ? 'text-white' : ''}`}>
        {label}
        <span className="text-[9px] opacity-70">{active ? (dir === 'desc' ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  );
}

/** Numbered pagination for a server-rendered table. */
export function Pager({
  page, pages, total, labels,
}: {
  page: number; pages: number; total: number;
  labels: { prev: string; next: string; of: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function go(p: number) {
    const q = new URLSearchParams(sp.toString());
    q.set('page', String(p));
    router.push(`${pathname}?${q.toString()}`);
  }

  // A window around the current page, with the first and last always reachable
  // so 26 pages do not become 26 buttons.
  const nums: (number | '…')[] = [];
  const push = (n: number | '…') => { if (nums[nums.length - 1] !== n) nums.push(n); };
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) push(p);
    else push('…');
  }

  const btn = (active: boolean) =>
    `min-w-[2rem] rounded-lg border px-2 py-1 text-xs ${
      active ? 'border-brand text-brand' : 'border-edge text-muted hover:text-white'
    }`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-muted">
      <span>
        {labels.of.replace('{a}', String(page)).replace('{b}', String(pages)).replace('{n}', String(total))}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <button className={btn(false)} disabled={page <= 1} onClick={() => go(page - 1)}
          style={{ opacity: page <= 1 ? 0.4 : 1 }}>{labels.prev}</button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`gap${i}`} className="px-1">…</span>
          ) : (
            <button key={n} className={btn(n === page)} onClick={() => go(n)}>{n}</button>
          )
        )}
        <button className={btn(false)} disabled={page >= pages} onClick={() => go(page + 1)}
          style={{ opacity: page >= pages ? 0.4 : 1 }}>{labels.next}</button>
      </div>
    </div>
  );
}
