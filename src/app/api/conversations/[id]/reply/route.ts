import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { sendText } from '@/lib/meta';
import { recordMessage, closeFollowUps } from '@/lib/crm';

export const runtime = 'nodejs';

/** Human reply from the dashboard. Taking a thread here permanently switches
 *  it to human_handling so the bot stops answering. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { text, agent } = (await req.json()) as { text?: string; agent?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'empty message' }, { status: 400 });

  const db = admin();
  const { data: convo } = await db
    .from('conversations').select('*, contacts(*)').eq('id', id).single();
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const contact = convo.contacts as { id: string; psid: string };
  let mid: string | null = null;
  try {
    const sent = await sendText(contact.psid, text);
    mid = sent.message_id ?? null;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  await recordMessage({
    conversationId: id, contactId: contact.id, mid,
    direction: 'out', author: 'human', text,
  });

  const now = new Date().toISOString();
  await db.from('conversations').update({
    status: 'human_handling',
    last_reply_by: 'human',
    assigned_to: agent ?? convo.assigned_to,
    outbound_count: (convo.outbound_count ?? 0) + 1,
    human_reply_count: (convo.human_reply_count ?? 0) + 1,
    last_message_at: now,
    needs_human_reason: null,
    needs_human_since: null,
  }).eq('id', id);
  await db.from('contacts').update({ last_outbound_at: now }).eq('id', contact.id);
  await closeFollowUps(contact.id);

  return NextResponse.json({ ok: true });
}
