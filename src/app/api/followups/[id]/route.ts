import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, hours } = (await req.json()) as { action?: string; hours?: number };
  const db = admin();
  if (action === 'done') {
    await db.from('msgr_follow_ups')
      .update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id);
  } else if (action === 'snooze') {
    await db.from('msgr_follow_ups').update({
      status: 'pending',
      due_at: new Date(Date.now() + (hours ?? 24) * 3600_000).toISOString(),
    }).eq('id', id);
  } else if (action === 'cancel') {
    await db.from('msgr_follow_ups').update({ status: 'cancelled' }).eq('id', id);
  } else {
    return NextResponse.json({ error: 'bad action' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
