import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Add, edit, deactivate or delete a payment channel. Channels that have
 *  already been used on an order are deactivated rather than deleted, so old
 *  orders keep saying how they were paid. */
export async function POST(req: NextRequest) {
  const b = await req.json() as {
    id?: string; name?: string; kind?: string; account_name?: string;
    account_no?: string; is_active?: boolean; delete_id?: string;
  };
  const db = admin();

  if (b.delete_id) {
    const { count } = await db.from('msgr_orders')
      .select('id', { count: 'exact', head: true }).eq('payment_channel_id', b.delete_id);
    if (count && count > 0) {
      await db.from('msgr_payment_channels')
        .update({ is_active: false }).eq('id', b.delete_id);
      return NextResponse.json({ ok: true, deactivated: true, used: count });
    }
    await db.from('msgr_payment_channels').delete().eq('id', b.delete_id);
    return NextResponse.json({ ok: true });
  }

  if (b.id && typeof b.is_active === 'boolean' && !b.name) {
    await db.from('msgr_payment_channels').update({ is_active: b.is_active }).eq('id', b.id);
    return NextResponse.json({ ok: true });
  }

  if (!b.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const row = {
    name: b.name.trim(),
    kind: b.kind || 'wallet',
    account_name: b.account_name?.trim() || null,
    account_no: b.account_no?.trim() || null,
    is_active: b.is_active ?? true,
  };
  const q = b.id
    ? db.from('msgr_payment_channels').update(row).eq('id', b.id)
    : db.from('msgr_payment_channels').insert(row);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
