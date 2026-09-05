import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { runBotTurn } from '@/lib/bot';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { status, assigned_to } = (await req.json()) as { status?: string; assigned_to?: string };
  const allowed = ['bot_handling', 'needs_human', 'human_handling', 'closed'];
  if (!status || !allowed.includes(status)) {
    return NextResponse.json({ error: 'bad status' }, { status: 400 });
  }
  const db = admin();
  const patch: Record<string, unknown> = { status };
  if (assigned_to !== undefined) patch.assigned_to = assigned_to;
  if (status === 'closed') patch.closed_at = new Date().toISOString();
  if (status !== 'needs_human') { patch.needs_human_reason = null; patch.needs_human_since = null; }
  await db.from('msgr_conversations').update(patch).eq('id', id);

  // Handing a thread back to the bot should produce an answer, not just a
  // status change: if the customer is the one waiting, reply to them now.
  if (status !== 'bot_handling') return NextResponse.json({ ok: true });

  const { data: convo } = await db
    .from('msgr_conversations').select('*, msgr_contacts(*)').eq('id', id).maybeSingle();
  const contact = (convo as { msgr_contacts?: Record<string, unknown> } | null)?.msgr_contacts;
  if (!convo || !contact) return NextResponse.json({ ok: true, replied: false });

  // Only answer if the last thing in the thread came from the customer.
  const { data: last } = await db
    .from('msgr_messages').select('direction,author,sent_at')
    .eq('conversation_id', id).order('sent_at', { ascending: false }).limit(1).maybeSingle();
  if (!last || last.direction !== 'in') {
    return NextResponse.json({ ok: true, replied: false, reason: 'no customer message waiting' });
  }

  try {
    const r = await runBotTurn({
      contact: contact as never,
      convo: convo as never,
      sentAt: last.sent_at,
      force: true,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[status] bot turn failed', e);
    return NextResponse.json({ ok: true, replied: false, reason: (e as Error).message });
  }
}
