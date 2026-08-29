import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

/** Record a sale. This is what turns a conversation into revenue in every
 *  report — nothing else marks a lead as won. */
export async function POST(req: NextRequest) {
  const b = (await req.json()) as {
    contact_id?: string; amount?: number; currency?: string;
    items?: unknown[]; status?: string; code?: string;
  };
  if (!b.contact_id || typeof b.amount !== 'number') {
    return NextResponse.json({ error: 'contact_id and amount required' }, { status: 400 });
  }
  const db = admin();
  const { data: contact } = await db
    .from('contacts').select('stage,source_ad_id,source_campaign_id').eq('id', b.contact_id).single();

  const { data, error } = await db.from('orders').insert({
    contact_id: b.contact_id,
    code: b.code ?? null,
    amount: b.amount,
    currency: b.currency ?? 'MMK',
    items: b.items ?? [],
    status: b.status ?? 'confirmed',
    ad_id: contact?.source_ad_id ?? null,
    campaign_id: contact?.source_campaign_id ?? null,
    confirmed_at: new Date().toISOString(),
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await db.from('contacts').update({ stage: 'won' }).eq('id', b.contact_id);
  await db.from('lead_events').insert({
    contact_id: b.contact_id, from_stage: contact?.stage ?? null, to_stage: 'won',
    reason: `order ${data.id} recorded`, actor: 'human',
  });
  await db.from('follow_ups').update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('contact_id', b.contact_id).eq('status', 'pending');

  return NextResponse.json({ ok: true, order: data });
}
