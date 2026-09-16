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

  const [contacts, adContacts, convoRows, orders, spendRes, needsHuman, botHandled, pendingTasks,
         aiRuns, inboundRows] =
    await Promise.all([
      db.from('msgr_contacts').select('id', { count: 'exact', head: true })
        .gte('first_seen_at', fromIso).lte('first_seen_at', toIso),
      // The same first-time contacts, narrowed to those an ad brought in. This
      // is the number that lines up with Meta's "conversations started" — both
      // are about a NEW conversation an ad caused, not about every person who
      // happens to have come from an ad at some point in the past.
      db.from('msgr_contacts').select('id', { count: 'exact', head: true })
        .gte('first_seen_at', fromIso).lte('first_seen_at', toIso)
        .not('source_ad_id', 'is', null),
      // "Engaged" and "never a conversation" are about how many times the
      // customer wrote, not what stage the AI put them in — someone can send
      // five messages and still sit at stage "new" if the bot never classified
      // them. Count the messages.
      db.from('msgr_conversations')
        .select('contact_id,inbound_count,msgr_contacts!inner(first_seen_at)')
        .gte('msgr_contacts.first_seen_at', fromIso)
        .lte('msgr_contacts.first_seen_at', toIso)
        .limit(20000),
      db.from('v_msgr_sales').select('contact_id,total,total_usd')
        .gte('created_at', fromIso).lte('created_at', toIso),
      // Meta's own count of conversations an ad started. Reported by the
      // Marketing API on a 7-day click / 1-day view window, so it will never
      // match a plain calendar-day count of first messages — that difference is
      // the attribution model, not a fault on either side.
      db.from('msgr_ad_daily').select('spend,messaging_conversations_started')
        .gte('date', since).lte('date', until),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).eq('status', 'needs_human'),
      db.from('msgr_conversations').select('id', { count: 'exact', head: true }).eq('last_reply_by', 'bot'),
      db.from('msgr_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('msgr_ai_runs').select('action')
        .gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
      // Everyone who wrote in this window, new or returning — the number Meta's
      // Business Suite calls "Total contacts". Ours counts only what reached
      // the webhook, so it is the smaller, verifiable side of that comparison.
      db.from('msgr_messages').select('contact_id')
        .eq('direction', 'in')
        .gte('sent_at', fromIso).lte('sent_at', toIso).limit(50000),
    ]);

  const revenue = (orders.data ?? []).reduce((s, o) => s + Number(o.total), 0);
  // Each sale was already converted at its own day's rate by the view.
  const revenueUsd = (orders.data ?? []).reduce((s, o) => s + Number(o.total_usd ?? 0), 0);
  const spend = (spendRes.data ?? []).reduce((s, r) => s + Number(r.spend), 0);
  const metaConversations = (spendRes.data ?? [])
    .reduce((s, r) => s + Number(r.messaging_conversations_started ?? 0), 0);
  const orderCount = orders.data?.length ?? 0;
  // People, not receipts. One customer placing three orders is one buyer, and
  // the tile that says "customers who bought" has to agree with the list it
  // opens — which is a list of people.
  const buyers = new Set(
    (orders.data ?? []).map((o) => o.contact_id).filter(Boolean) as string[]
  ).size;
  const leads = contacts.count ?? 0;
  const leadsAds = adContacts.count ?? 0;
  const leadsOrganic = leads - leadsAds;
  const messagedIds = [...new Set(
    (inboundRows.data ?? []).map((m) => m.contact_id).filter(Boolean) as string[]
  )];
  const messaged = messagedIds.length;

  // Paid vs organic, read from the ad each contact first arrived through. The
  // label is frozen at first contact, so someone who came from an ad in June
  // and writes again today still counts as paid — which is how a shop thinks
  // about it, and why this will not line up with Meta's per-conversation split.
  let messagedAds = 0;
  if (messagedIds.length) {
    const { count } = await db.from('msgr_contacts')
      .select('id', { count: 'exact', head: true })
      .in('id', messagedIds.slice(0, 1000))
      .not('source_ad_id', 'is', null);
    messagedAds = count ?? 0;
  }
  const messagedOrganic = messaged - messagedAds;
  const runs = aiRuns.data ?? [];
  const handoffs = runs.filter((r) => r.action === 'handoff').length;

  // One inbound message and nothing after it is someone who never became a
  // conversation; two or more is a real exchange.
  const convos = (convoRows.data ?? []) as { inbound_count: number }[];
  const engagedCount = convos.filter((c) => Number(c.inbound_count) > 1).length;
  const noConvo = convos.filter((c) => Number(c.inbound_count) <= 1).length;

  return {
    leads,
    leadsAds,
    leadsOrganic,
    messaged,
    messagedAds,
    messagedOrganic,
    engaged: engagedCount,
    noConvo,
    orders: orderCount,
    buyers,
    metaConversations,
    costPerMetaConversation: metaConversations ? spend / metaConversations : null,
    revenue,
    spend,
    costPerLead: leads ? spend / leads : null,
    costPerOrder: orderCount ? spend / orderCount : null,
    revenueUsd,
    // Spend is billed in USD; revenue_usd was converted per sale at that day's
    // rate, so the two sides of this ratio are finally the same currency.
    roas: spend ? revenueUsd / spend : null,
    convRate: leads ? (buyers / leads) * 100 : null,
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
/** The overview tiles link here with a segment, so a number on the dashboard
 *  can always be opened and checked name by name. */
export type Segment = 'leads' | 'engaged' | 'no_convo' | 'won';

export async function customerList(opts: {
  q?: string; stage?: string; source?: string; limit?: number;
  segment?: string; since?: string; until?: string;
}): Promise<CustomerRow[]> {
  const db = admin();
  let query = db
    .from('msgr_contacts')
    .select('id,name,psid,phone,email,address,stage,tags,notes,source_type,source_ad_id,customer_id,first_seen_at,last_inbound_at')
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 300);

  if (opts.segment && opts.since && opts.until) {
    const { from, to } = instants(opts.since, opts.until);

    if (opts.segment === 'won') {
      // A buyer is someone with a sale dated inside the window — not someone
      // whose *stage* says won, and not someone who first wrote to us inside
      // the window. Those are three different sets, and the dashboard counts
      // this one.
      const { data: sold } = await db.from('v_msgr_sales')
        .select('contact_id').gte('created_at', from).lte('created_at', to).limit(20000);
      const ids = [...new Set(
        (sold ?? []).map((r) => r.contact_id).filter(Boolean) as string[]
      )];
      if (!ids.length) return [];
      query = query.in('id', ids.slice(0, 1000));
    } else {
      query = query.gte('first_seen_at', from).lte('first_seen_at', to);
    }

    // "Engaged" and "never a conversation" are counted from how many messages
    // the customer sent, exactly as the overview tile counts them — so pull
    // the matching contact ids first and filter to those.
    if (opts.segment === 'engaged' || opts.segment === 'no_convo') {
      const { data: convos } = await db
        .from('msgr_conversations')
        .select('contact_id,inbound_count,msgr_contacts!inner(first_seen_at)')
        .gte('msgr_contacts.first_seen_at', from)
        .lte('msgr_contacts.first_seen_at', to)
        .limit(20000);
      const want = opts.segment === 'engaged'
        ? (n: number) => n > 1
        : (n: number) => n <= 1;
      const ids = (convos ?? [])
        .filter((c) => want(Number(c.inbound_count)))
        .map((c) => c.contact_id as string);
      if (!ids.length) return [];
      query = query.in('id', ids.slice(0, 1000));
    }
  }

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
  byChannel: { channel: string; orders: number; revenue: number }[];
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
    .select('sale_id,total,total_usd,order_status,store_id,created_at,ad_id,channel')
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
  const channelMap = group((r) => String(r.channel ?? 'online'));
  const storeMap = group((r) => String(r.store_id ?? '—'));
  const dayMap = group((r) =>
    new Date(r.created_at as string).toLocaleDateString('en-CA', { timeZone: 'Asia/Yangon' })
  );

  // A store id can belong to either shop list; look in both and merge.
  const storeIds = [...storeMap.keys()].filter((s) => s !== '—');
  const [ownShops, posStores] = storeIds.length
    ? await Promise.all([
        db.from('msgr_shops').select('id,name').in('id', storeIds),
        db.from('stores').select('id,name').in('id', storeIds),
      ])
    : [{ data: [] }, { data: [] }];
  const storeName = new Map(
    [...(ownShops.data ?? []), ...(posStores.data ?? [])]
      .map((s) => [s.id as string, s.name as string])
  );

  // Lines live in two places — orders taken here, and POS sales — so the
  // best-seller table reads whichever side each sale came from.
  const items: { product_name: string; qty: number; line_total: number }[] = [];
  const onlineIds = rows.filter((r) => r.channel === 'online').map((r) => r.sale_id as string);
  const posIds = rows.filter((r) => r.channel !== 'online').map((r) => r.sale_id as string);

  for (let i = 0; i < onlineIds.length; i += 200) {
    const { data } = await db.from('msgr_order_items')
      .select('description,qty,line_total').in('order_id', onlineIds.slice(i, i + 200));
    items.push(...((data ?? []) as { description: string; qty: number; line_total: number }[])
      .map((d) => ({ product_name: d.description, qty: d.qty, line_total: d.line_total })));
  }
  for (let i = 0; i < posIds.length; i += 200) {
    const { data } = await db.from('sale_items')
      .select('product_name,qty,line_total').in('sale_id', posIds.slice(i, i + 200));
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
    byChannel: [...channelMap].map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    topProducts: [...prodMap].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    fromAds: {
      orders: adRows.length,
      revenue: adRows.reduce((a, r) => a + Number(r.total || 0), 0),
    },
  };
}
