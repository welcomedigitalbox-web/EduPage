'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TRACK, stepIndex, canSetTrack, canDelete, canCancel } from '@/lib/order-workflow';
import type { Role } from '@/lib/session';

export interface WorkflowLabels {
  payment: string; delivery: string;
  states: Record<string, string>;
  forwardOnly: string; del: string; delConfirm: string; delLocked: string;
  cancel: string; notAllowed: string;
}

/** Two step rails. An agent sees one live button — the next step — and the
 *  rest as plain marks, so there is nothing to click that would be refused. */
export function OrderWorkflow({
  orderId, role, payment, delivery, status, labels,
}: {
  orderId: string; role: Role;
  payment: string; delivery: string; status: string;
  labels: WorkflowLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    const res = await fetch('/api/online-orders/track', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: orderId, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error === 'not allowed' ? labels.notAllowed : String(j.error)); return; }
    if (j.deleted) { router.push('/orders'); router.refresh(); return; }
    router.refresh();
  }

  const Rail = ({ name, current, title }: {
    name: 'payment' | 'delivery'; current: string; title: string;
  }) => (
    <div className="space-y-1.5">
      <div className="text-xs text-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {TRACK.map((s) => {
          const at = s === current;
          const past = stepIndex(s) < stepIndex(current);
          const allowed = !at && canSetTrack(role, current, s);
          const tone = at
            ? 'border-brand bg-brand/15 text-brand'
            : past ? 'border-good/50 text-good' : 'border-edge text-muted';
          return (
            <button key={s} disabled={busy || !allowed}
              onClick={() => post({ track: name, to: s })}
              className={`rounded-lg border px-2.5 py-1 text-xs ${tone} ${
                allowed ? 'hover:border-brand hover:text-brand' : 'cursor-default'}`}>
              {past ? '✓ ' : ''}{labels.states[s]}
            </button>
          );
        })}
      </div>
    </div>
  );

  const deletable = canDelete(role, { payment_status: payment });

  return (
    <div className="card space-y-3 p-4 print:hidden">
      <Rail name="payment" current={payment} title={labels.payment} />
      <Rail name="delivery" current={delivery} title={labels.delivery} />
      {role !== 'manager' && <p className="text-[11px] text-muted">{labels.forwardOnly}</p>}
      {err && <p className="text-xs text-bad">{err}</p>}

      {role === 'manager' && (
        <div className="flex flex-wrap gap-2 border-t border-edge pt-3">
          {status !== 'cancelled' && canCancel(role) && (
            <button className="btn text-xs" disabled={busy}
              onClick={() => post({ cancel: true })}>{labels.cancel}</button>
          )}
          <button
            className={`btn text-xs ${deletable ? 'text-bad' : 'opacity-50'}`}
            disabled={busy || !deletable}
            title={deletable ? undefined : labels.delLocked}
            onClick={() => { if (confirm(labels.delConfirm)) post({ del: true }); }}>
            {labels.del}
          </button>
          {!deletable && <span className="self-center text-[11px] text-muted">{labels.delLocked}</span>}
        </div>
      )}
    </div>
  );
}
