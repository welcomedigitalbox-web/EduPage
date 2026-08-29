import { admin } from './supabase';

export interface DailyRow {
  day: string; new_contacts: number; engaged_contacts: number;
  no_convo_contacts: number; orders: number; revenue: number; spend: number;
}

export async function dailyFunnel(days = 30): Promise<DailyRow[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await admin()
    .from('v_msgr_daily').select('*').gte('day', from).order('day');
  return (data ?? []) as DailyRow[];
}

export async function stageCounts(days = 30) {
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await admin()
    .from('msgr_contacts').select('stage').gte('first_seen_at', from).limit(10000);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
  return counts;
}

/** The headline numbers. Every one of these maps to a question Kay asked. */
export async function overview(days = 30) {
  const db = admin();
  const fromIso = new Date(Date.now() - days * 86400_000).toISOString();
  const fromDay = fromIso.slice(0, 10);

  const [contacts, engaged, orders, spendRes, needsHuman, botHandled, pendingTasks, aiRuns] =
    await Promise.all([
      db.from('msgr_contacts').select('id', { count: 'exact', head: true }).gte('first_seen_at', fromIso),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).gt('inbound_count', 1),
      db.from('v_msgr_sales').select('total').gte('created_at', fromIso),
      db.from('msgr_ad_daily').select('spend').gte('date', fromDay),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).eq('status', 'needs_human'),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).eq('last_reply_by', 'bot'),
      db.from('msgr_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('msgr_ai_runs').select('action').gte('created_at', fromIso).limit(10000),
    ]);

  const revenue = (orders.data ?? []).reduce((s, o) => s + Number(o.total), 0);
  const spend = (spendRes.data ?? []).reduce((s, r) => s + Number(r.spend), 0);
  const orderCount = orders.data?.length ?? 0;
  const leads = contacts.count ?? 0;
  const runs = aiRuns.data ?? [];
  const handoffs = runs.filter((r) => r.action === 'handoff').length;

  // "conversation မဖြစ်သွားတဲ့သူ" — messaged once, never became a real exchange
  const { count: noConvo } = await db
    .from('msgr_conversations').select('id', { count: 'exact', head: true }).lte('inbound_count', 1);

  return {
    leads,
    engaged: engaged.count ?? 0,
    noConvo: noConvo ?? 0,
    orders: orderCount,
    revenue,
    spend,
    costPerLead: leads ? spend / leads : null,
    costPerOrder: orderCount ? spend / orderCount : null,
    roas: spend ? revenue / spend : null,
    convRate: leads ? (orderCount / leads) * 100 : null,
    needsHuman: needsHuman.count ?? 0,
    botHandled: botHandled.count ?? 0,
    pendingTasks: pendingTasks.count ?? 0,
    aiReplies: runs.length - handoffs,
    aiHandoffs: handoffs,
    autoRate: runs.length ? ((runs.length - handoffs) / runs.length) * 100 : null,
  };
}

export async function adPerformance() {
  const { data } = await admin()
    .from('v_msgr_ad_performance').select('*').order('spend', { ascending: false }).limit(100);
  return data ?? [];
}

export async function conversationList(filter: string) {
  let q = admin()
    .from('msgr_conversations')
    .select('*, msgr_contacts(id,name,psid,stage,phone,profile_pic,source_ad_id)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (filter === 'needs_human') q = q.eq('status', 'needs_human');
  else if (filter === 'bot') q = q.eq('last_reply_by', 'bot').eq('status', 'bot_handling');
  else if (filter === 'human') q = q.eq('status', 'human_handling');
  else if (filter === 'no_reply') q = q.eq('outbound_count', 0);
  const { data } = await q;
  return data ?? [];
}

export async function conversationDetail(id: string) {
  const db = admin();
  const { data: convo } = await db
    .from('msgr_conversations').select('*, msgr_contacts(*)').eq('id', id).single();
  if (!convo) return null;
  const { data: messages } = await db
    .from('msgr_messages').select('*').eq('conversation_id', id).order('sent_at').limit(200);
  const { data: events } = await db
    .from('msgr_lead_events').select('*').eq('contact_id', convo.contact_id)
    .order('created_at', { ascending: false }).limit(20);
  return { convo, messages: messages ?? [], events: events ?? [] };
}

export async function followUpQueue() {
  const { data } = await admin()
    .from('msgr_follow_ups')
    .select('*, msgr_contacts(id,name,psid,stage,phone,last_inbound_at)')
    .eq('status', 'pending')
    .order('priority')
    .order('due_at')
    .limit(200);
  return data ?? [];
}
