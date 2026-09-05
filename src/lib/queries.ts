import { admin } from './supabase';
import { instants } from './range';

export interface DailyRow {
  day: string; new_contacts: number; engaged_contacts: number;
  no_convo_contacts: number; orders: number; revenue: number;
  revenue_usd: number; spend: number;
}

export async function dailyFunnel(since: string, until: string): Promise<DailyRow[]> {
  const { data } = await admin()
    .from('v_msgr_daily').select('*').gte('day', since).lte('day', until).order('day');
  return (data ?? []) as DailyRow[];
}

export async function stageCounts(since: string, until: string) {
  const { from, to } = instants(since, until);
  const { data } = await admin()
    .from('msgr_contacts').select('stage')
    .gte('first_seen_at', from).lte('first_seen_at', to).limit(10000);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
  return counts;
}

/** The headline numbers. Every one of these maps to a question Kay asked. */
export async function overview(since: string, until: string) {
  const db = admin();
  const { from: fromIso, to: toIso } = instants(since, until);

  const [contacts, engaged, orders, spendRes, needsHuman, botHandled, pendingTasks, aiRuns,
         noConvoRes] =
    await Promise.all([
      db.from('msgr_contacts').select('id', { count: 'exact', head: true })
        .gte('first_seen_at', fromIso).lte('first_seen_at', toIso),
      db.from('msgr_contacts').select('id', { count: 'exact', head: true })
        .gte('first_seen_at', fromIso).lte('first_seen_at', toIso).neq('stage', 'new'),
      db.from('v_msgr_sales').select('total,total_usd')
        .gte('created_at', fromIso).lte('created_at', toIso),
      db.from('msgr_ad_daily').select('spend').gte('date', since).lte('date', until),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).eq('status', 'needs_human'),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).eq('last_reply_by', 'bot'),
      db.from('msgr_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('msgr_ai_runs').select('action')
        .gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
      // "conversation မဖြစ်သွားတဲ့သူ" — messaged once in this window, then silence
      db.from('msgr_contacts').select('id', { count: 'exact', head: true })
        .gte('first_seen_at', fromIso).lte('first_seen_at', toIso).eq('stage', 'new'),
    ]);

  const revenue = (orders.data ?? []).reduce((s, o) => s + Number(o.total), 0);
  // Each sale was already converted at its own day's rate by the view.
  const revenueUsd = (orders.data ?? []).reduce((s, o) => s + Number(o.total_usd ?? 0), 0);
  const spend = (spendRes.data ?? []).reduce((s, r) => s + Number(r.spend), 0);
  const orderCount = orders.data?.length ?? 0;
  const leads = contacts.count ?? 0;
  const runs = aiRuns.data ?? [];
  const handoffs = runs.filter((r) => r.action === 'handoff').length;

  const noConvo = noConvoRes.count;

  return {
    leads,
    engaged: engaged.count ?? 0,
    noConvo: noConvo ?? 0,
    orders: orderCount,
    revenue,
    spend,
    costPerLead: leads ? spend / leads : null,
    costPerOrder: orderCount ? spend / orderCount : null,
    revenueUsd,
    // Spend is billed in USD; revenue_usd was converted per sale at that day's
    // rate, so the two sides of this ratio are finally the same currency.
    roas: spend ? revenueUsd / spend : null,
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
  // "Waiting on us" is a comparison between two columns, which PostgREST
  // cannot express as a filter — so fetch a wider slice and narrow it here.
  if (filter === 'unanswered') {
    const { data } = await admin()
      .from('msgr_conversations')
      .select('*, msgr_contacts(id,name,psid,stage,phone,profile_pic,source_ad_id)')
      .neq('status', 'closed')
      .not('last_inbound_at', 'is', null)
      // Same window the badge counts over, so the number and the list agree.
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1000);
    return (data ?? []).filter(
      (c) => c.last_message_at && c.last_inbound_at && c.last_message_at <= c.last_inbound_at
    ).slice(0, 200);
  }

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

// ---------------- Online sales report ----------------

export interface SalesReport {
  orders: number;
  revenue: number;
  revenueUsd: number;
  aov: number | null;
  byStatus: { status: string; orders: number; revenue: number }[];
  byStore: { store_id: string; store_name: string; orders: number; revenue: number }[];
  byDay: { day: string; orders: number; revenue: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  fromAds: { orders: number; revenue: number };
}

/**
 * Everything the shop sold through Messenger in a window. Cancelled orders are
 * already excluded by v_msgr_sales, so these are real sales, not attempts.
 */
export async function salesReport(since: string, until: string): Promise<SalesReport> {
  const db = admin();
  const { from, to } = instants(since, until);

  const { data: sales } = await db
    .from('v_msgr_sales')
    .select('sale_id,total,total_usd,order_status,store_id,created_at,ad_id')
    .gte('created_at', from).lte('created_at', to)
    .limit(5000);
  const rows = sales ?? [];

  const revenue = rows.reduce((a, r) => a + Number(r.total || 0), 0);
  const revenueUsd = rows.reduce((a, r) => a + Number(r.total_usd || 0), 0);

  const group = <T extends string>(key: (r: (typeof rows)[number]) => T) => {
    const m = new Map<T, { orders: number; revenue: number }>();
    for (const r of rows) {
      const k = key(r);
      const cur = m.get(k) ?? { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += Number(r.total || 0);
      m.set(k, cur);
    }
    return m;
  };

  const statusMap = group((r) => String(r.order_status ?? 'unknown'));
  const storeMap = group((r) => String(r.store_id ?? '—'));
  const dayMap = group((r) =>
    new Date(r.created_at as string).toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' })
  );

  // Store names live in the POS, not in the view.
  const storeIds = [...storeMap.keys()].filter((s) => s !== '—');
  const { data: stores } = storeIds.length
    ? await db.from('stores').select('id,name').in('id', storeIds)
    : { data: [] as { id: string; name: string }[] };
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));

  // Line items for the same sales, for the best-seller table.
  const saleIds = rows.map((r) => r.sale_id as string);
  const items: { product_name: string; qty: number; line_total: number }[] = [];
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data } = await db.from('sale_items')
      .select('product_name,qty,line_total').in('sale_id', saleIds.slice(i, i + 200));
    items.push(...((data ?? []) as typeof items));
  }
  const prodMap = new Map<string, { qty: number; revenue: number }>();
  for (const it of items) {
    const k = it.product_name || '—';
    const cur = prodMap.get(k) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(it.qty || 0);
    cur.revenue += Number(it.line_total || 0);
    prodMap.set(k, cur);
  }

  const adRows = rows.filter((r) => r.ad_id);

  return {
    orders: rows.length,
    revenue,
    revenueUsd,
    aov: rows.length ? revenue / rows.length : null,
    byStatus: [...statusMap].map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byStore: [...storeMap].map(([store_id, v]) => ({
      store_id, store_name: storeName.get(store_id) ?? store_id, ...v,
    })).sort((a, b) => b.revenue - a.revenue),
    byDay: [...dayMap].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    topProducts: [...prodMap].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    fromAds: {
      orders: adRows.length,
      revenue: adRows.reduce((a, r) => a + Number(r.total || 0), 0),
    },
  };
}
