export type LeadStage =
  | 'new' | 'engaged' | 'qualified' | 'negotiating'
  | 'ordered' | 'won' | 'lost' | 'ghosted';

export type ConvoStatus = 'bot_handling' | 'needs_human' | 'human_handling' | 'closed';
export type MsgAuthor = 'customer' | 'bot' | 'human' | 'system';

export interface Contact {
  id: string;
  page_id: string;
  psid: string;
  name: string | null;
  profile_pic: string | null;
  phone: string | null;
  address: string | null;
  stage: LeadStage;
  tags: string[];
  notes: string | null;
  source_type: string | null;
  source_ad_id: string | null;
  source_campaign_id: string | null;
  source_ref: string | null;
  first_seen_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

export interface Conversation {
  id: string;
  contact_id: string;
  status: ConvoStatus;
  last_reply_by: MsgAuthor | null;
  needs_human_reason: string | null;
  needs_human_since: string | null;
  assigned_to: string | null;
  inbound_count: number;
  outbound_count: number;
  bot_reply_count: number;
  human_reply_count: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  contact_id: string;
  direction: 'in' | 'out';
  author: MsgAuthor;
  text: string | null;
  attachments: unknown[];
  ai: Record<string, unknown> | null;
  sent_at: string;
}

export interface BotSettings {
  is_enabled: boolean;
  business_name: string;
  default_store_id: string | null;
  fulfilment_store_ids: string[];
  quote_stock: boolean;
  max_kb_products: number;
  language: string;
  persona: string;
  greeting: string | null;
  handoff_message: string | null;
  ad_currency: string;
  mmk_per_usd: number;
  handoff_keywords: string[];
  office_hours: string | null;
  min_confidence: number;
  max_bot_turns: number;
  follow_up_hours: number;
  ghost_hours: number;
}

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: 'အသစ်',
  engaged: 'စကားပြောနေ',
  qualified: 'စိတ်ဝင်စား',
  negotiating: 'ညှိနှိုင်းနေ',
  ordered: 'မှာပြီး',
  won: 'ရောင်းရ',
  lost: 'မဝယ်တော့',
  ghosted: 'ပျောက်သွား',
};
