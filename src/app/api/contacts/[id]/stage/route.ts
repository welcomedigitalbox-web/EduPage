import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { stage, reason } = (await req.json()) as { stage?: string; reason?: string };
  if (!stage) return NextResponse.json({ error: 'stage required' }, { status: 400 });
  const db = admin();
  const { data: contact } = await db.from('contacts').select('stage').eq('id', id).single();
  await db.from('contacts').update({ stage }).eq('id', id);
  await db.from('lead_events').insert({
    contact_id: id, from_stage: contact?.stage ?? null, to_stage: stage,
    reason: reason ?? 'set manually from dashboard', actor: 'human',
  });
  return NextResponse.json({ ok: true });
}
