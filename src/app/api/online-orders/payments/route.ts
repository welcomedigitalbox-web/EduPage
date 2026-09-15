import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { paymentState, paymentTrackFor } from '@/lib/order-payment';
import { deriveStatus } from '@/lib/order-workflow';

export const runtime = 'nodejs';

/** Recompute the order's received total from its receipts, and move the
 *  payment rail to match. Doing it from the rows rather than adding to a
 *  running figure means a deleted receipt cannot leave the order overpaid. */
async function resync(orderId: string) {
  const db = admin();
  const { data: rows } = await db.from('msgr_order_payments')
    .select('amount').eq('order_id', orderId);
  const received = (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const { data: o } = await db.from('msgr_orders')
    .select('grand_total,status,delivery_status').eq('id', orderId).maybeSingle();
  const track = paymentTrackFor(paymentState(Number(o?.grand_total ?? 0), received));

  await db.from('msgr_orders').update({
    amount_received: received,
    payment_status: track,
    status: deriveStatus(track, (o?.delivery_status as string) ?? 'pending',
                         o?.status as string),
    updated_at: new Date().toISOString(),
  }).eq('id', orderId);

  return received;
}

export async function POST(req: NextRequest) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const b = await req.json() as {
    order_id?: string; amount?: number; channel_id?: string; ref?: string;
    slips?: string[]; paid_at?: string; note?: string; delete_id?: string;
    items?: { order_id: string; amount: number }[];
  };
  const db = admin();

  if (b.delete_id) {
    // Removing money already recorded is a manager's call.
    if (session.role !== 'manager') {
      return NextResponse.json({ error: 'not allowed' }, { status: 403 });
    }
    const { data: row } = await db.from('msgr_order_payments')
      .select('order_id').eq('id', b.delete_id).maybeSingle();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await db.from('msgr_order_payments').delete().eq('id', b.delete_id);
    const received = await resync(row.order_id as string);
    return NextResponse.json({ ok: true, received });
  }

  let channelNameBulk: string | null = null;
  if (b.items?.length) {
    // A courier settles a week of COD in one statement, so the same reference
    // and date go onto every order on that sheet in one go.
    if (b.channel_id) {
      const { data: c } = await db.from('msgr_payment_channels')
        .select('name').eq('id', b.channel_id).maybeSingle();
      channelNameBulk = (c?.name as string) ?? null;
    }
    const rows = b.items
      .filter((i) => i.order_id && Number(i.amount) > 0)
      .map((i) => ({
        order_id: i.order_id,
        amount: Number(i.amount),
        channel_id: b.channel_id || null,
        channel_name: channelNameBulk,
        ref: b.ref?.trim() || null,
        slips: b.slips ?? [],
        paid_at: b.paid_at || undefined,
        note: b.note?.trim() || null,
        actor_id: session.uid,
        actor_name: session.name || session.email,
      }));
    if (!rows.length) {
      return NextResponse.json({ error: 'nothing to settle' }, { status: 400 });
    }
    const { error } = await db.from('msgr_order_payments').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    for (const id of [...new Set(rows.map((r) => r.order_id))]) await resync(id);
    return NextResponse.json({ ok: true, settled: rows.length });
  }

  const amount = Number(b.amount ?? 0);
  if (!b.order_id || !(amount > 0)) {
    return NextResponse.json({ error: 'an amount above zero is required' }, { status: 400 });
  }

  let channelName: string | null = null;
  if (b.channel_id) {
    const { data: c } = await db.from('msgr_payment_channels')
      .select('name').eq('id', b.channel_id).maybeSingle();
    channelName = (c?.name as string) ?? null;
  }

  const { error } = await db.from('msgr_order_payments').insert({
    order_id: b.order_id,
    amount,
    channel_id: b.channel_id || null,
    channel_name: channelName,
    ref: b.ref?.trim() || null,
    slips: b.slips ?? [],
    paid_at: b.paid_at || undefined,
    note: b.note?.trim() || null,
    actor_id: session.uid,
    actor_name: session.name || session.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const received = await resync(b.order_id);
  return NextResponse.json({ ok: true, received });
}
