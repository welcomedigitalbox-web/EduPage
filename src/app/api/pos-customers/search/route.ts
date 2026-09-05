import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Search the POS customer book, so a Messenger contact can be attached to a
 *  household member's existing account instead of creating a duplicate. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').replace(/[%,]/g, ' ').trim();
  if (q.length < 2) return NextResponse.json({ customers: [] });

  const db = admin();
  const { data } = await db
    .from('customers')
    .select('id,name,phone,email,delivery_address,store_id,loyalty_tier_id')
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(15);

  const rows = data ?? [];
  if (!rows.length) return NextResponse.json({ customers: [] });

  // Lifetime spend makes it obvious which record is the real household account.
  const { data: sales } = await db
    .from('sales').select('customer_id,total,order_status')
    .in('customer_id', rows.map((r) => r.id));

  const spend = new Map<string, number>();
  for (const s of sales ?? []) {
    if (s.order_status === 'cancelled') continue;
    spend.set(s.customer_id, (spend.get(s.customer_id) ?? 0) + Number(s.total || 0));
  }

  return NextResponse.json({
    customers: rows.map((r) => ({ ...r, lifetime_spend: spend.get(r.id) ?? 0 })),
  });
}
