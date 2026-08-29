import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const b = await req.json();
  const db = admin();
  if (b.delete_id) {
    await db.from('msgr_kb_items').delete().eq('id', b.delete_id);
    return NextResponse.json({ ok: true });
  }
  if (!b.title || !b.body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400 });
  }
  const row = {
    kind: b.kind ?? 'policy',
    title: b.title,
    body: b.body,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = b.id
    ? await db.from('msgr_kb_items').update(row).eq('id', b.id)
    : await db.from('msgr_kb_items').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
