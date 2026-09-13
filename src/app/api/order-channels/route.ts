import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

/** Add, rename, deactivate or delete an order channel. A channel already used
 *  on orders is deactivated instead of deleted. */
export async function POST(req: NextRequest) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session?.role !== 'manager') {
    return NextResponse.json({ error: 'manager only' }, { status: 403 });
  }
  const b = await req.json() as {
    id?: string; name?: string; is_active?: boolean; delete_id?: string;
  };
  const db = admin();

  if (b.delete_id) {
    const { count } = await db.from('msgr_orders')
      .select('id', { count: 'exact', head: true }).eq('order_channel_id', b.delete_id);
    if (count && count > 0) {
      await db.from('msgr_order_channels').update({ is_active: false }).eq('id', b.delete_id);
      return NextResponse.json({ ok: true, deactivated: true });
    }
    await db.from('msgr_order_channels').delete().eq('id', b.delete_id);
    return NextResponse.json({ ok: true });
  }

  if (b.id && typeof b.is_active === 'boolean' && !b.name) {
    await db.from('msgr_order_channels').update({ is_active: b.is_active }).eq('id', b.id);
    return NextResponse.json({ ok: true });
  }

  if (!b.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const row = { name: b.name.trim() };
  const { error } = b.id
    ? await db.from('msgr_order_channels').update(row).eq('id', b.id)
    : await db.from('msgr_order_channels').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
