'use client';
import { useState } from 'react';

export interface KbLine {
  kind: string;
  title: string;
  body: string;
  price?: number | null;
  stock?: number | null;
}

/** Shows the exact material handed to the model, so staff can see why the bot
 *  answered — or refused to. */
export function KbPreview({
  products, policies, labels,
}: {
  products: KbLine[];
  policies: KbLine[];
  labels: {
    title: string; sub: string; productCount: string; policyCount: string;
    noStore: string; outOfStock: string; showAll: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? products : products.slice(0, 12);

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="label">{labels.title}</div>
        <p className="mt-1 text-xs text-muted">{labels.sub}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-edge px-2 py-1">{labels.policyCount}</span>
        <span className="rounded bg-edge px-2 py-1">{labels.productCount}</span>
      </div>

      <div className="space-y-1">
        {policies.map((p) => (
          <details key={p.title} className="rounded-lg border border-edge px-2 py-1.5">
            <summary className="cursor-pointer text-xs">{p.title}</summary>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{p.body}</p>
          </details>
        ))}
      </div>

      {!products.length ? (
        <p className="text-xs text-warn">{labels.noStore}</p>
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-edge">
            {shown.map((p) => (
              <div key={p.title} className="flex items-center justify-between gap-2 border-b border-edge/50 px-2 py-1 text-xs last:border-0">
                <span className="truncate">{p.title}</span>
                <span className={`shrink-0 tabular-nums ${(p.stock ?? 0) <= 0 ? 'text-bad' : 'text-muted'}`}>
                  {p.price != null ? p.price.toLocaleString() : '—'}
                  {(p.stock ?? 0) <= 0 ? ` · ${labels.outOfStock}` : ` · ${p.stock}`}
                </span>
              </div>
            ))}
          </div>
          {products.length > 12 && !expanded && (
            <button className="btn text-xs" onClick={() => setExpanded(true)}>
              {labels.showAll} ({products.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}
