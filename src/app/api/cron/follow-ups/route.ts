import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/crm';

export const runtime = 'nodejs';

function authorised(req: NextRequest) {
  const secret = env.cronSecret();
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * The sweeper that answers "follow up လုပ်ဖို့ လိုသေးလား".
 * Three passes:
 *  1. Customer asked something, we answered, they went quiet  → follow-up task
 *  2. Nobody ever replied to the customer at all              → urgent task
 *  3. Silent far past the ghost threshold                     → stage = ghosted
 */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return new NextResponse('unauthorized', { status: 401 });

  const db = admin();
  const s = await getSettings();
  const now = Date.now();
  const quietSince = new Date(now - s.follow_up_hours * 3600_000).toISOString();
  const ghostSince = new Date(now - s.ghost_hours * 3600_000).toISOString();

  const { data: convos } = await db
    .from('msgr_conversations')
    .select('id, contact_id, status, outbound_count, inbound_count, last_inbound_at, last_message_at, msgr_contacts!inner(id, stage, name)')
    .neq('status', 'closed')
    .lt('last_message_at', quietSince)
    .limit(500);

  const { data: openTasks } = await db
    .from('msgr_follow_ups').select('contact_id').eq('status', 'pending');
  const hasTask = new Set((openTasks ?? []).map((t) => t.contact_id));

  const created: string[] = [];
  const ghosted: string[] = [];

  for (const c of convos ?? []) {
    const contact = (c.msgr_contacts as unknown) as { id: string; stage: string; name: string | null };
    if (['won', 'lost'].includes(contact.stage)) continue;

    // 2. never answered at all — this is the expensive one, ads paid for it
    if ((c.outbound_count ?? 0) === 0) {
      if (!hasTask.has(contact.id)) {
        await db.from('msgr_follow_ups').insert({
          contact_id: contact.id, due_at: new Date().toISOString(), priority: 1,
          reason: 'ဘယ်သူမှ မပြန်ဖြေရသေးဘူး — ads ငွေကုန်ပြီး စကားမဖြစ်သွားတဲ့ lead',
        });
        created.push(contact.id);
      }
      continue;
    }

    // 3. ghosted
    if ((c.last_message_at ?? '') < ghostSince && !['ordered'].includes(contact.stage)) {
      if (contact.stage !== 'ghosted') {
        await db.from('msgr_contacts').update({ stage: 'ghosted' }).eq('id', contact.id);
        await db.from('msgr_lead_events').insert({
          contact_id: contact.id, from_stage: contact.stage, to_stage: 'ghosted',
          reason: `no activity for ${s.ghost_hours}h`, actor: 'system',
        });
        ghosted.push(contact.id);
      }
      continue;
    }

    // 1. quiet but still warm
    if (!hasTask.has(contact.id) && ['qualified', 'negotiating', 'ordered'].includes(contact.stage)) {
      await db.from('msgr_follow_ups').insert({
        contact_id: contact.id, due_at: new Date().toISOString(),
        priority: contact.stage === 'ordered' ? 1 : 2,
        reason: `${s.follow_up_hours} နာရီကျော် တိတ်နေတယ် (stage: ${contact.stage}) — ဆက်မေးပေးပါ`,
      });
      created.push(contact.id);
    }
  }

  return NextResponse.json({
    ok: true, scanned: convos?.length ?? 0,
    tasks_created: created.length, marked_ghosted: ghosted.length,
  });
}
