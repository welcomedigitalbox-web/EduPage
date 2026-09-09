import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase';
import { saveOrder, ORDER_STATUSES, type OrderInput } from '@/lib/orders';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const body = (await req.json()) as OrderInput & { status_only?: string };

  // A status change is its own, much smaller request.
  if (body.id && body.status_only) {
    if (!ORDER_STATUSES.includes(body.status_only as typeof ORDER_STATUSES[number])) {
      return NextResponse.json({ error: 'bad status' }, { status: 400 });
    }
    const { error } = await admin().from('msgr_orders')
      .update({ status: body.status_only, updated_at: new Date().toISOString() })
      .eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!body.customer_name?.trim()) {
    return NextResponse.json({ error: 'customer name is required' }, { status: 400 });
  }

  try {
    const id = await saveOrder(body, {
      id: session?.uid ?? null,
      name: session?.name || session?.email || null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
