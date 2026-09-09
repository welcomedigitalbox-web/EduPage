'use client';
import { useState } from 'react';

/** A row is label / value, plus an optional small line under the label — a
 *  barcode, a reference, anything that identifies without shouting. */
export type CardRow = [label: string, value: string, sub?: string];
export interface CardSection { title: string; rows: CardRow[] }

export interface CardLabels {
  open: string; close: string; copy: string; copied: string; print: string; hint: string;
}

/**
 * A modal built to be screenshotted: a fixed 380px column on a light ground,
 * so the crop is predictable and the text stays readable when the picture is
 * forwarded on a phone.
 */
export function OrderCard({
  ref_, status, date, total, sections, shareText, labels,
}: {
  ref_: string; status: string; date: string; total: string;
  sections: CardSection[];
  shareText: string;
  labels: CardLabels;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(shareText); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = shareText; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
  }

  return (
    <>
      <button className="btn print:hidden" onClick={() => setOpen(true)}>{labels.open}</button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
          onClick={() => setOpen(false)}>
          <div className="my-4 w-full max-w-[380px]" onClick={(e) => e.stopPropagation()}>
            {/* the screenshot target */}
            <div id="order-card" className="rounded-2xl bg-white p-5 text-[13px] text-slate-900 shadow-xl">
              <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
                <div>
                  <div className="text-lg font-bold tracking-tight">{ref_}</div>
                  <div className="text-[11px] text-slate-500">{date}</div>
                </div>
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white">
                  {status}
                </span>
              </div>

              {sections.map((sec) => (
                <div key={sec.title} className="border-b border-slate-100 py-3 last:border-0">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {sec.title}
                  </div>
                  <div className="space-y-1">
                    {sec.rows.map(([k, v, sub], i) => (
                      <div key={i} className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">
                          {k}
                          {sub ? (
                            <span className="block text-[10px] tabular-nums text-slate-400">
                              {sub}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-right font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-3 flex items-baseline justify-between rounded-xl bg-slate-900 px-3 py-2.5 text-white">
                <span className="text-[11px] opacity-80">Total</span>
                <span className="text-base font-bold tabular-nums">{total}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button className="btn text-xs" onClick={copy}>
                {done ? labels.copied : labels.copy}
              </button>
              <button className="btn text-xs" onClick={() => window.print()}>{labels.print}</button>
              <button className="btn text-xs" onClick={() => setOpen(false)}>{labels.close}</button>
            </div>
            <p className="mt-2 text-center text-[11px] text-white/60">{labels.hint}</p>
          </div>
        </div>
      )}
    </>
  );
}
