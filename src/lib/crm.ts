import { admin } from './supabase';
import type { BotSettings, LeadStage, MsgAuthor } from './types';
import type { KbItem } from './ai';
import { fetchSellablePooled } from './pos';

const STAGE_ORDER: LeadStage[] = [
  'new', 'engaged', 'qualified', 'negotiating', 'ordered', 'won',
];

/** Stages only move forward, except for the terminal states lost/ghosted
 *  which a human or the cron job sets explicitly. */
export function shouldAdvance(from: LeadStage, to: LeadStage): boolean {
  if (from === to) return false;
  if (to === 'lost' || to === 'ghosted') return true;
  if (from === 'won' || from === 'lost') return false;
  const a = STAGE_ORDER.indexOf(from);
  const b = STAGE_ORDER.indexOf(to);
  if (a === -1 || b === -1) return false;
  return b > a;
}

export async function getSettings(): Promise<BotSettings> {
  const { data } = await admin().from('msgr_settings').select('*').eq('id', 1).single();
  return (data ?? {
    is_enabled: true, business_name: 'My Shop', default_store_id: null,
    fulfilment_store_ids: [],
    quote_stock: true, max_kb_products: 120, language: 'my',
    persona: 'Friendly, concise Burmese shop assistant.', greeting: null,
    handoff_message: 'ဒီအကြောင်းလေးကို သေချာစစ်ပြီး admin မှ မကြာခင် ပြန်ဖြေပေးပါမယ်ရှင် 🙏',
    ad_currency: 'USD', mmk_per_usd: 4500,
    handoff_keywords: [], office_hours: null, min_confidence: 0.6,
    max_bot_turns: 20, follow_up_hours: 4, ghost_hours: 48,
  }) as BotSettings;
}

/**
 * The bot's knowledge base = live POS products (price + stock for the store
 * that fulfils Messenger orders) + the policy notes that a product row cannot
 * express. Nothing about a product is stored twice, so a price change at the
 * till is reflected in the next Messenger reply.
 */
export async function getKb(settings: BotSettings): Promise<KbItem[]> {
  const { data: policies } = await admin()
    .from('msgr_kb_items').select('kind,title,body').eq('is_active', true).limit(60);

  const items: KbItem[] = (policies ?? []).map((p) => ({
    kind: p.kind, title: p.title, body: p.body,
  }));

  const storeIds = fulfilmentStores(settings);
  if (!storeIds.length) return items;

  // Pooled stock: the customer does not care which shop it ships from.
  const products = await fetchSellablePooled(storeIds, settings.max_kb_products);
  for (const p of products) {
    items.push({
      kind: 'product',
      title: p.display_name,
      body: '',
      price: p.price,
      stock: p.stock_qty,
      sku: p.sku,
      product_id: p.product_id,
      variant_id: p.variant_id,
    });
  }
  return items;
}

/** The stores the bot may quote and the dashboard may ship from. */
export function fulfilmentStores(settings: BotSettings): string[] {
  const ids = settings.fulfilment_store_ids ?? [];
  if (ids.length) return ids;
  return settings.default_store_id ? [settings.default_store_id] : [];
}

export interface Referral {
  source?: string; type?: string; ad_id?: string; ref?: string;
  ads_context_data?: unknown; campaign_id?: string;
}

export async function upsertContact(pageId: string, psid: string, referral?: Referral) {
  const db = admin();
  const { data: existing } = await db
    .from('msgr_contacts').select('*').eq('page_id', pageId).eq('psid', psid).maybeSingle();

  if (existing) {
    // Only fill attribution if it was never captured — first touch wins.
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (referral?.ad_id && !existing.source_ad_id) {
      patch.source_ad_id = referral.ad_id;
      patch.source_type = 'ad';
      patch.source_ref = referral.ref ?? null;
    }
    await db.from('msgr_contacts').update(patch).eq('id', existing.id);
    return { ...existing, ...patch };
  }

  const insert = {
    page_id: pageId,
    psid,
    source_type: referral?.ad_id ? 'ad' : referral?.ref ? 'm.me_ref' : 'organic',
    source_ad_id: referral?.ad_id ?? null,
    source_ref: referral?.ref ?? null,
  };
  const { data, error } = await db.from('msgr_contacts').insert(insert).select('*').single();
  if (error) throw error;
  return data;
}

export async function getOrCreateConversation(contactId: string) {
  const db = admin();
  const { data: existing } = await db
    .from('msgr_conversations').select('*').eq('contact_id', contactId).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db
    .from('msgr_conversations').insert({ contact_id: contactId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function recordMessage(args: {
  conversationId: string;
  contactId: string;
  mid?: string | null;
  direction: 'in' | 'out';
  author: MsgAuthor;
  text?: string | null;
  attachments?: unknown[];
  referral?: unknown;
  ai?: Record<string, unknown> | null;
  sentAt?: string;
}) {
  const db = admin();
  const { error } = await db.from('msgr_messages').insert({
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    mid: args.mid ?? null,
    direction: args.direction,
    author: args.author,
    text: args.text ?? null,
    attachments: args.attachments ?? [],
    referral: args.referral ?? null,
    ai: args.ai ?? null,
    sent_at: args.sentAt ?? new Date().toISOString(),
  });
  // 23505 = duplicate mid, meaning Meta retried this webhook. Not an error.
  if (error && error.code !== '23505') throw error;
  return !error;
}

export async function setStage(
  contactId: string, from: LeadStage, to: LeadStage, reason: string, actor: MsgAuthor = 'system'
) {
  if (!shouldAdvance(from, to)) return false;
  const db = admin();
  await db.from('msgr_contacts').update({ stage: to }).eq('id', contactId);
  await db.from('msgr_lead_events').insert({
    contact_id: contactId, from_stage: from, to_stage: to, reason, actor,
  });
  return true;
}

export async function handoffToHuman(conversationId: string, reason: string) {
  const db = admin();
  const { data: convo } = await db
    .from('msgr_conversations').select('needs_human_since').eq('id', conversationId).maybeSingle();
  await db.from('msgr_conversations').update({
    status: 'needs_human',
    needs_human_reason: reason,
    // Keep the original timestamp so the queue still shows how long they waited.
    needs_human_since: convo?.needs_human_since ?? new Date().toISOString(),
  }).eq('id', conversationId);
}

export async function scheduleFollowUp(args: {
  contactId: string; hours: number; reason: string; priority?: number;
}) {
  const db = admin();
  const due = new Date(Date.now() + args.hours * 3600_000).toISOString();
  // one open follow-up per contact; a newer one replaces the old
  await db.from('msgr_follow_ups')
    .update({ status: 'cancelled' })
    .eq('contact_id', args.contactId).eq('status', 'pending');
  await db.from('msgr_follow_ups').insert({
    contact_id: args.contactId, due_at: due, reason: args.reason,
    priority: args.priority ?? 2, created_by: 'system',
  });
}

export async function closeFollowUps(contactId: string) {
  await admin().from('msgr_follow_ups')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('contact_id', contactId).eq('status', 'pending');
}

export async function recentHistory(conversationId: string, limit = 16) {
  const { data } = await admin()
    .from('msgr_messages')
    .select('direction,author,text,attachments,sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  return (data ?? []).reverse().map((m) => ({
    role: (m.direction === 'in' ? 'customer' : 'agent') as 'customer' | 'agent',
    text: m.text || (Array.isArray(m.attachments) && m.attachments.length ? '(sent an image/attachment)' : ''),
  }));
}

/** Deterministic guards that run BEFORE the model. Cheaper and more reliable
 *  than asking the model to police itself. */
export function preflightHandoff(
  settings: BotSettings,
  text: string | null,
  convo: { bot_reply_count: number; status?: string },
  hasAttachment: boolean
): string | null {
  if (!settings.is_enabled) return 'bot disabled';
  // The turn limit flags the thread for staff ONCE. After that the thread is
  // already on the needs-human list, so muting the bot only leaves the
  // customer repeating themselves into silence — keep answering what the
  // knowledge base covers.
  if (convo.bot_reply_count >= settings.max_bot_turns && convo.status !== 'needs_human') {
    return `bot hit ${settings.max_bot_turns}-turn limit`;
  }
  if (hasAttachment && !text) return 'customer sent an image (likely a payment slip or product photo)';
  const lower = (text ?? '').toLowerCase();
  const hit = settings.handoff_keywords.find((k) => k && lower.includes(k.toLowerCase()));
  if (hit) return `handoff keyword: "${hit}"`;
  return null;
}
