import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { canSetTrack, canDelete, canCancel, deriveStatus } from '@/lib/order-workflow';

export const runtime = 'nodejs';

/** Advance one track, cancel, or delete. Every branch re-reads the order and
 *  re-checks the role here: the buttons the browser drew are a convenience,
 *  not the rule. */
export async function POST(req: NextRequest) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const b = await req.json() as {
    id?: string; track?: 'payment' | 'delivery'; to?: string;
    cancel?: boolean; del?: boolean;
  };
  if (!b.id) return NextResponse.json({ error: 'no order' }, { status: 400 });

  const db = admin();
  const { data: o } = await db.from('msgr_orders')
    .select('id,status,payment_status,delivery_status').eq('id', b.id).maybeSingle();
  if (!o) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const payment = (o.payment_status as string) ?? 'pending';
  const delivery = (o.delivery_status as string) ?? 'pending';

  const log = (track: string, from: string | null, to: string) =>
    db.from('msgr_order_events').insert({
      order_id: b.id, track, from_state: from, to_state: to,
      actor_id: session.uid, actor_name: session.name || session.email,
    });

  if (b.del) {
    if (!canDelete(session.role, { payment_status: payment })) {
      return NextResponse.json({ error: 'not allowed' }, { status: 403 });
    }
    const { error } = await db.from('msgr_orders').delete().eq('id', b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (b.cancel) {
    if (!canCancel(session.role)) {
      return NextResponse.json({ error: 'not allowed' }, { status: 403 });
    }
    await db.from('msgr_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', b.id);
    await log('order', o.status as string, 'cancelled');
    return NextResponse.json({ ok: true });
  }

  if (!b.track || !b.to) return NextResponse.json({ error: 'no change' }, { status: 400 });
  const from = b.track === 'payment' ? payment : delivery;
  if (!canSetTrack(session.role, from, b.to)) {
    return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  }

  const next = {
    payment: b.track === 'payment' ? b.to : payment,
    delivery: b.track === 'delivery' ? b.to : delivery,
  };
  const { error } = await db.from('msgr_orders').update({
    [b.track === 'payment' ? 'payment_status' : 'delivery_status']: b.to,
    status: deriveStatus(next.payment, next.delivery, o.status as string),
    updated_at: new Date().toISOString(),
  }).eq('id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await log(b.track, from, b.to);

  return NextResponse.json({ ok: true });
}
