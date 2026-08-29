import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const b = await req.json();
  const db = admin();
  if (b.delete_id) {
    await db.from('kb_items').delete().eq('id', b.delete_id);
    return NextResponse.json({ ok: true });
  }
  if (!b.title || !b.body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400 });
  }
  const row = {
    kind: b.kind ?? 'faq',
    title: b.title,
    body: b.body,
    price: b.price ?? null,
    currency: b.currency ?? 'MMK',
    in_stock: b.in_stock ?? true,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = b.id
    ? await db.from('kb_items').update(row).eq('id', b.id)
    : await db.from('kb_items').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
