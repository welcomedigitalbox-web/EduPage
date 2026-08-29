-- =====================================================================
-- Messenger AI CRM — runs INSIDE the existing POS Supabase project.
--
-- Everything new is prefixed msgr_ so it can never collide with a POS
-- table. Products, stock, customers, sales and ad campaigns are NOT
-- duplicated here — the messenger app reads the POS tables directly.
--
-- Run once in the POS project's SQL editor.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type msgr_stage as enum (
    'new','engaged','qualified','negotiating','ordered','won','lost','ghosted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type msgr_direction as enum ('in','out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msgr_author as enum ('customer','bot','human','system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msgr_convo_status as enum ('bot_handling','needs_human','human_handling','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msgr_followup_status as enum ('pending','done','snoozed','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- contacts ----------
-- A Messenger identity. Links to a POS customer once we know who they are,
-- which is what lets a Messenger lead inherit its loyalty tier and history.
create table if not exists msgr_contacts (
  id            uuid primary key default gen_random_uuid(),
  page_id       text not null,
  psid          text not null,
  customer_id   uuid references customers(id) on delete set null,
  store_id      text,                     -- which POS store fulfils this lead
  name          text,
  profile_pic   text,
  locale        text,
  phone         text,
  address       text,
  stage         msgr_stage not null default 'new',
  tags          text[] not null default '{}',
  notes         text,
  source_type   text,                     -- ad | m.me_ref | organic
  source_ad_id  text,
  source_adset_id text,
  source_campaign_id text,
  source_ref    text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,
  is_blocked    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (page_id, psid)
);
create index if not exists msgr_contacts_stage_idx on msgr_contacts(stage);
create index if not exists msgr_contacts_seen_idx on msgr_contacts(first_seen_at desc);
create index if not exists msgr_contacts_ad_idx on msgr_contacts(source_ad_id);
create index if not exists msgr_contacts_customer_idx on msgr_contacts(customer_id);

-- ---------- conversations ----------
create table if not exists msgr_conversations (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references msgr_contacts(id) on delete cascade,
  status        msgr_convo_status not null default 'bot_handling',
  last_reply_by msgr_author,
  needs_human_reason text,
  needs_human_since  timestamptz,
  assigned_to   text,
  inbound_count  int not null default 0,
  outbound_count int not null default 0,
  bot_reply_count   int not null default 0,
  human_reply_count int not null default 0,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  first_response_seconds int,
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists msgr_conversations_contact_uidx on msgr_conversations(contact_id);
create index if not exists msgr_conversations_status_idx on msgr_conversations(status, last_message_at desc);

-- ---------- messages ----------
create table if not exists msgr_messages (
  id            uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references msgr_conversations(id) on delete cascade,
  contact_id    uuid not null references msgr_contacts(id) on delete cascade,
  mid           text,
  direction     msgr_direction not null,
  author        msgr_author not null,
  text          text,
  attachments   jsonb not null default '[]'::jsonb,
  referral      jsonb,
  ai            jsonb,
  sent_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create unique index if not exists msgr_messages_mid_uidx on msgr_messages(mid) where mid is not null;
create index if not exists msgr_messages_convo_idx on msgr_messages(conversation_id, sent_at);

-- ---------- stage history ----------
create table if not exists msgr_lead_events (
  id          bigserial primary key,
  contact_id  uuid not null references msgr_contacts(id) on delete cascade,
  from_stage  msgr_stage,
  to_stage    msgr_stage not null,
  reason      text,
  actor       msgr_author not null default 'system',
  created_at  timestamptz not null default now()
);
create index if not exists msgr_lead_events_idx on msgr_lead_events(contact_id, created_at desc);

-- ---------- follow-ups ----------
create table if not exists msgr_follow_ups (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references msgr_contacts(id) on delete cascade,
  due_at      timestamptz not null,
  reason      text not null,
  status      msgr_followup_status not null default 'pending',
  priority    int not null default 2,
  assigned_to text,
  created_by  msgr_author not null default 'system',
  completed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists msgr_follow_ups_due_idx on msgr_follow_ups(status, due_at);
create unique index if not exists msgr_follow_ups_open_uidx
  on msgr_follow_ups(contact_id) where status = 'pending';

-- ---------- the link from a Messenger chat to a real POS sale ----------
-- The sale itself lives in `sales` (channel = 'messenger'). This table only
-- records which conversation produced it, so ad attribution survives even
-- after the POS order is edited or the contact merged.
create table if not exists msgr_sale_links (
  sale_id     uuid primary key references sales(id) on delete cascade,
  contact_id  uuid not null references msgr_contacts(id) on delete cascade,
  ad_id       text,
  campaign_id text,
  created_at  timestamptz not null default now()
);
create index if not exists msgr_sale_links_contact_idx on msgr_sale_links(contact_id);
create index if not exists msgr_sale_links_ad_idx on msgr_sale_links(ad_id);

-- ---------- extra KB entries the bot needs that products can't express ----------
-- Delivery fees, payment methods, return policy, opening hours. Product facts
-- (name, price, stock) come live from the POS tables — never duplicated here.
create table if not exists msgr_kb_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'policy',   -- policy | faq
  title       text not null,
  body        text not null,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ---------- bot settings ----------
create table if not exists msgr_settings (
  id                 int primary key default 1,
  is_enabled         boolean not null default true,
  business_name      text not null default 'My Shop',
  default_store_id   text,                        -- which POS store the bot quotes stock from
  language           text not null default 'my',
  persona            text not null default 'Friendly, concise Burmese shop assistant.',
  greeting           text,
  handoff_keywords   text[] not null default array['ပြန်အမ်း','တိုင်','manager','refund','complain'],
  office_hours       text default '9:00-21:00',
  min_confidence     numeric(3,2) not null default 0.60,
  max_bot_turns      int not null default 6,
  follow_up_hours    int not null default 4,
  ghost_hours        int not null default 48,
  quote_stock        boolean not null default true,  -- may the bot state stock levels?
  max_kb_products    int not null default 120,
  updated_at         timestamptz not null default now()
);
insert into msgr_settings (id) values (1) on conflict (id) do nothing;

-- ---------- AI run log ----------
create table if not exists msgr_ai_runs (
  id            bigserial primary key,
  conversation_id uuid references msgr_conversations(id) on delete set null,
  model         text,
  intent        text,
  confidence    numeric(3,2),
  action        text,
  handoff_reason text,
  input_tokens  int,
  output_tokens int,
  latency_ms    int,
  created_at    timestamptz not null default now()
);
create index if not exists msgr_ai_runs_idx on msgr_ai_runs(created_at desc);

-- ---------- ad-level insights ----------
-- The POS already has campaign-level ad_daily_stats. Messenger attribution
-- needs AD-level granularity (the webhook gives us referral.ad_id), so this
-- table sits underneath it; the sync job fills both.
create table if not exists msgr_ad_daily (
  id            bigserial primary key,
  date          date not null,
  ad_account_id text not null,
  campaign_id   text,
  campaign_name text,
  adset_id      text,
  adset_name    text,
  ad_id         text not null,
  ad_name       text,
  spend         numeric(12,2) not null default 0,
  impressions   bigint not null default 0,
  reach         bigint not null default 0,
  clicks        bigint not null default 0,
  messaging_conversations_started int not null default 0,
  currency      text,
  raw           jsonb,
  synced_at     timestamptz not null default now(),
  unique (date, ad_id)
);
create index if not exists msgr_ad_daily_date_idx on msgr_ad_daily(date desc);

-- =====================================================================
-- Views
-- =====================================================================

-- Revenue counted for a Messenger lead = its POS sales, minus cancellations.
create or replace view v_msgr_sales as
select
  l.contact_id,
  l.ad_id,
  l.campaign_id,
  s.id as sale_id,
  s.sale_ref,
  s.total,
  s.order_status,
  s.store_id,
  s.created_at
from msgr_sale_links l
join sales s on s.id = l.sale_id
where coalesce(s.order_status, 'delivered') <> 'cancelled';

create or replace view v_msgr_daily as
select
  d.day::date as day,
  coalesce(c.new_contacts, 0)      as new_contacts,
  coalesce(c.engaged_contacts, 0)  as engaged_contacts,
  coalesce(c.no_convo_contacts, 0) as no_convo_contacts,
  coalesce(o.orders, 0)            as orders,
  coalesce(o.revenue, 0)           as revenue,
  coalesce(a.spend, 0)             as spend
from generate_series(current_date - interval '89 days', current_date, interval '1 day') d(day)
left join (
  select date_trunc('day', ct.first_seen_at)::date as day,
         count(*) as new_contacts,
         count(*) filter (where cv.inbound_count > 1) as engaged_contacts,
         count(*) filter (where coalesce(cv.inbound_count,0) <= 1) as no_convo_contacts
  from msgr_contacts ct
  left join msgr_conversations cv on cv.contact_id = ct.id
  group by 1
) c on c.day = d.day::date
left join (
  select date_trunc('day', created_at)::date as day,
         count(*) as orders, sum(total) as revenue
  from v_msgr_sales group by 1
) o on o.day = d.day::date
left join (
  select date as day, sum(spend) as spend from msgr_ad_daily group by 1
) a on a.day = d.day::date;

create or replace view v_msgr_ad_performance as
with spend as (
  select ad_id,
         max(ad_name) as ad_name, max(campaign_name) as campaign_name,
         min(date) as first_date, max(date) as last_date,
         sum(spend) as spend, sum(impressions) as impressions, sum(clicks) as clicks,
         sum(messaging_conversations_started) as meta_conversations
  from msgr_ad_daily group by ad_id
),
leads as (
  select source_ad_id as ad_id,
         count(*) as leads,
         count(*) filter (where stage in ('qualified','negotiating','ordered','won')) as qualified,
         count(*) filter (where stage = 'won') as won
  from msgr_contacts where source_ad_id is not null group by 1
),
rev as (
  select ad_id, count(*) as orders, sum(total) as revenue
  from v_msgr_sales where ad_id is not null group by 1
)
select
  s.ad_id, s.ad_name, s.campaign_name, s.first_date, s.last_date,
  s.spend, s.impressions, s.clicks, s.meta_conversations,
  coalesce(l.leads,0) as leads,
  coalesce(l.qualified,0) as qualified_leads,
  coalesce(r.orders,0) as orders,
  coalesce(r.revenue,0) as revenue,
  case when coalesce(l.leads,0) > 0 then round(s.spend / l.leads, 2) end as cost_per_lead,
  case when coalesce(r.orders,0) > 0 then round(s.spend / r.orders, 2) end as cost_per_order,
  case when s.spend > 0 then round(coalesce(r.revenue,0) / s.spend, 2) end as roas
from spend s
left join leads l on l.ad_id = s.ad_id
left join rev r on r.ad_id = s.ad_id;

create or replace view v_msgr_needs_human as
select
  cv.id as conversation_id, ct.id as contact_id,
  ct.name, ct.psid, ct.stage, ct.phone,
  cv.status, cv.needs_human_reason, cv.needs_human_since,
  cv.last_message_at, cv.last_inbound_at,
  cv.inbound_count, cv.bot_reply_count, cv.human_reply_count,
  extract(epoch from (now() - cv.last_inbound_at))/60 as minutes_waiting
from msgr_conversations cv
join msgr_contacts ct on ct.id = cv.contact_id
where cv.status in ('needs_human','human_handling')
order by cv.needs_human_since nulls last, cv.last_inbound_at;

-- =====================================================================
-- RLS — the messenger app only ever reaches these through the service role
-- key on its own server. No client-side policy is granted.
-- =====================================================================
alter table msgr_contacts      enable row level security;
alter table msgr_conversations enable row level security;
alter table msgr_messages      enable row level security;
alter table msgr_lead_events   enable row level security;
alter table msgr_follow_ups    enable row level security;
alter table msgr_sale_links    enable row level security;
alter table msgr_kb_items      enable row level security;
alter table msgr_settings      enable row level security;
alter table msgr_ai_runs       enable row level security;
alter table msgr_ad_daily      enable row level security;

-- =====================================================================
-- POS side: the messenger channel needs to be a first-class sale channel
-- =====================================================================
alter table sales add column if not exists channel text;
alter table sales add column if not exists order_status text;

-- Seed the policy KB with the things a product row cannot express.
insert into msgr_kb_items (kind, title, body) values
('policy','Delivery','ရန်ကုန်မြို့တွင်း ၁ ရက်၊ နယ်မြို့ ၂-၃ ရက်။ ပို့ခ ရန်ကုန် ၂၀၀၀ / နယ် ၄၀၀၀ ကျပ်။'),
('policy','Payment','KBZPay, WavePay, CB Pay နှင့် COD (ရန်ကုန်သာ) လက်ခံပါတယ်။'),
('policy','Return','ပစ္စည်းပျက်စီးမှုရှိပါက ၇ ရက်အတွင်း ပြန်လဲပေးပါတယ်။')
on conflict do nothing;
