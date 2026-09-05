import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Attach this Messenger contact to an existing POS customer, or detach it.
 *
 * Several contacts may point at the same customer on purpose: a husband and
 * wife messaging from their own Facebook accounts should share one loyalty
 * account. The delivery address still comes from the contact, so each person
 * can be shipped to separately.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { customer_id } = (await req.json()) as { customer_id?: string | null };
  const db = admin();

  if (customer_id) {
    const { data: customer } = await db
      .from('customers').select('id,store_id').eq('id', customer_id).maybeSingle();
    if (!customer) return NextResponse.json({ error: 'customer_not_found' }, { status: 404 });

    const { error } = await db.from('msgr_contacts')
      .update({ customer_id: customer.id, store_id: customer.store_id })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, customer_id: customer.id });
  }

  const { error } = await db.from('msgr_contacts').update({ customer_id: null }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, customer_id: null });
}
