'use client';
import { useState } from 'react';

export interface ReceiptLine { qty: string; name: string; price: string; total: string }

export interface ReceiptData {
  shopName: string;
  phone?: string | null;
  note?: string | null;
  footer?: string | null;
  ref: string;
  date: string;
  customer: string;
  customerPhone?: string | null;
  address?: string | null;
  lines: ReceiptLine[];
  money: [label: string, value: string, strong?: boolean][];
  deliveryMethod?: string | null;
  paymentMethod?: string | null;
}

export interface ReceiptLabels {
  open: string; close: string; copy: string; copied: string; print: string;
  hint: string; to: string; qty: string; item: string; amount: string;
  delivery: string; payment: string;
}

/**
 * What the customer receives. Deliberately narrow: no staff name, no ad the
 * order came from, no internal note — nothing the shop would not want
 * forwarded on.
 */
export function Receipt({ data, labels, text }: {
  data: ReceiptData; labels: ReceiptLabels; text: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
  }

  return (
    <>
      <button className="btn print:hidden" onClick={() => setOpen(true)}>{labels.open}</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
             onClick={() => setOpen(false)}>
          <div className="my-4 w-full max-w-[380px]" onClick={(e) => e.stopPropagation()}>
            <div id="receipt" className="rounded-2xl bg-white p-5 text-[13px] text-slate-900 shadow-xl">
              <div className="text-center">
                <div className="text-base font-bold">{data.shopName}</div>
                {data.phone ? <div className="text-[11px] text-slate-500">{data.phone}</div> : null}
                {data.note ? (
                  <div className="mt-1 whitespace-pre-wrap text-[11px] text-slate-500">{data.note}</div>
                ) : null}
              </div>

              <div className="mt-3 flex items-baseline justify-between border-y border-slate-200 py-2 text-[11px]">
                <span className="font-semibold">{data.ref}</span>
                <span className="text-slate-500">{data.date}</span>
              </div>

              <div className="py-2 text-[12px]">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{labels.to}</div>
                <div className="font-medium">{data.customer}</div>
                {data.customerPhone ? (
                  <div className="text-slate-600">{data.customerPhone}</div>
                ) : null}
                {data.address ? (
                  <div className="whitespace-pre-wrap text-slate-600">{data.address}</div>
                ) : null}
              </div>

              <table className="w-full border-t border-slate-200 text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 text-left font-medium">{labels.item}</th>
                    <th className="py-1.5 text-right font-medium">{labels.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-1">
                        <div>{l.name}</div>
                        <div className="text-[10px] tabular-nums text-slate-500">
                          {l.qty} × {l.price}
                        </div>
                      </td>
                      <td className="py-1 text-right tabular-nums">{l.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 border-t border-slate-200 pt-2 text-[12px]">
                {data.money.map(([k, v, strong], i) => (
                  <div key={i}
                       className={`flex items-baseline justify-between ${
                         strong ? 'border-t border-slate-200 pt-1.5 text-[14px] font-bold' : ''}`}>
                    <span className={strong ? '' : 'text-slate-500'}>{k}</span>
                    <span className="tabular-nums">{v}</span>
                  </div>
                ))}
              </div>

              {(data.paymentMethod || data.deliveryMethod) && (
                <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
                  {data.paymentMethod ? (
                    <div className="flex justify-between">
                      <span>{labels.payment}</span><span>{data.paymentMethod}</span>
                    </div>
                  ) : null}
                  {data.deliveryMethod ? (
                    <div className="flex justify-between">
                      <span>{labels.delivery}</span><span>{data.deliveryMethod}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {data.footer ? (
                <div className="mt-3 whitespace-pre-wrap border-t border-slate-200 pt-3 text-center text-[11px] text-slate-600">
                  {data.footer}
                </div>
              ) : null}
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
