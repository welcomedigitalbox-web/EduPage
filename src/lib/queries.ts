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


export interface CustomerRow {
  contact_id: string;
  conversation_id: string | null;
  name: string | null;
  psid: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  stage: string;
  tags: string[];
  notes: string | null;
  source_type: string | null;
  source_ad_id: string | null;
  customer_id: string | null;
  first_seen_at: string;
  last_inbound_at: string | null;
  orders: number;
  revenue: number;
}

/** The customer list. Messenger identity on the left, real POS money on the right. */
export async function customerList(opts: {
  q?: string; stage?: string; source?: string; limit?: number;
}): Promise<CustomerRow[]> {
  const db = admin();
  let query = db
    .from('msgr_contacts')
    .select('id,name,psid,phone,email,address,stage,tags,notes,source_type,source_ad_id,customer_id,first_seen_at,last_inbound_at')
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 300);

  if (opts.stage) query = query.eq('stage', opts.stage);
  if (opts.source === 'ad') query = query.not('source_ad_id', 'is', null);
  if (opts.source === 'organic') query = query.is('source_ad_id', null);
  if (opts.q) {
    const term = opts.q.replace(/[%,]/g, ' ').trim();
    if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,psid.ilike.%${term}%`);
  }

  const { data: contacts } = await query;
  const rows = contacts ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: convos }, { data: sales }] = await Promise.all([
    db.from('msgr_conversations').select('id,contact_id').in('contact_id', ids),
    db.from('v_msgr_sales').select('contact_id,total').in('contact_id', ids),
  ]);

  const convoOf = new Map((convos ?? []).map((c) => [c.contact_id, c.id as string]));
  const money = new Map<string, { orders: number; revenue: number }>();
  for (const s of sales ?? []) {
    const cur = money.get(s.contact_id) ?? { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += Number(s.total) || 0;
    money.set(s.contact_id, cur);
  }

  return rows.map((r) => ({
    contact_id: r.id,
    conversation_id: convoOf.get(r.id) ?? null,
    name: r.name, psid: r.psid, phone: r.phone, email: r.email, address: r.address,
    stage: r.stage, tags: r.tags ?? [], notes: r.notes,
    source_type: r.source_type, source_ad_id: r.source_ad_id,
    customer_id: r.customer_id,
    first_seen_at: r.first_seen_at, last_inbound_at: r.last_inbound_at,
    orders: money.get(r.id)?.orders ?? 0,
    revenue: money.get(r.id)?.revenue ?? 0,
  }));
}

/** Every tag in use, for the filter chips. */
export async function allTags(): Promise<string[]> {
  const { data } = await admin().from('msgr_contacts').select('tags').limit(2000);
  const set = new Set<string>();
  for (const r of data ?? []) for (const t of (r.tags ?? []) as string[]) if (t) set.add(t);
  return [...set].sort();
}
