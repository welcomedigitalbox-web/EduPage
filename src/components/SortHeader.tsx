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

/** Prev/next for a server-rendered table. */
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

  return (
    <div className="flex items-center justify-between p-3 text-xs text-muted">
      <span>{labels.of.replace('{a}', String(page)).replace('{b}', String(pages)).replace('{n}', String(total))}</span>
      <div className="flex gap-2">
        <button className="btn text-xs disabled:opacity-40" disabled={page <= 1}
          onClick={() => go(page - 1)}>{labels.prev}</button>
        <button className="btn text-xs disabled:opacity-40" disabled={page >= pages}
          onClick={() => go(page + 1)}>{labels.next}</button>
      </div>
    </div>
  );
}
