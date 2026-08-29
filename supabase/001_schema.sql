-- =====================================================================
-- Messenger AI CRM — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type lead_stage as enum (
    'new',           -- first message received, nothing qualified yet
    'engaged',       -- asked about a product / replied more than once
    'qualified',     -- gave intent: price ok, asked delivery, gave phone
    'negotiating',   -- discussing price / stock / delivery details
    'ordered',       -- said yes, order captured
    'won',           -- paid / delivered
    'lost',          -- explicitly declined
    'ghosted'        -- stopped replying after being engaged
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type msg_direction as enum ('in','out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msg_author as enum ('customer','bot','human','system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type convo_status as enum ('bot_handling','needs_human','human_handling','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type followup_status as enum ('pending','done','snoozed','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- contacts ----------
create table if not exists contacts (
  id            uuid primary key default gen_random_uuid(),
  page_id       text not null,
  psid          text not null,                      -- page-scoped user id
  name          text,
  profile_pic   text,
  locale        text,
  phone         text,
  address       text,
  stage         lead_stage not null default 'new',
  tags          text[] not null default '{}',
  notes         text,
  -- ad attribution captured from the very first referral payload
  source_type   text,                               -- 'ad' | 'm.me_ref' | 'organic' | 'shortlink'
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
create index if not exists contacts_stage_idx on contacts(stage);
create index if not exists contacts_first_seen_idx on contacts(first_seen_at desc);
create index if not exists contacts_source_ad_idx on contacts(source_ad_id);

-- ---------- conversations ----------
create table if not exists conversations (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  status        convo_status not null default 'bot_handling',
  -- who produced the LAST outbound message: lets the dashboard answer
  -- "bot က ဘယ်သူကို ပြန်ထားလဲ" at a glance
  last_reply_by msg_author,
  needs_human_reason text,
  needs_human_since  timestamptz,
  assigned_to   text,
  inbound_count  int not null default 0,
  outbound_count int not null default 0,
  bot_reply_count   int not null default 0,
  human_reply_count int not null default 0,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  first_response_seconds int,       -- time to first reply, for SLA reporting
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists conversations_contact_uidx on conversations(contact_id);
create index if not exists conversations_status_idx on conversations(status, last_message_at desc);

-- ---------- messages ----------
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  mid           text,                                -- Meta message id, for dedupe
  direction     msg_direction not null,
  author        msg_author not null,
  text          text,
  attachments   jsonb not null default '[]'::jsonb,
  quick_reply   text,
  referral      jsonb,                               -- raw ad referral payload
  ai            jsonb,                               -- model, tokens, confidence, intent
  sent_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create unique index if not exists messages_mid_uidx on messages(mid) where mid is not null;
create index if not exists messages_convo_idx on messages(conversation_id, sent_at);

-- ---------- stage history ----------
create table if not exists lead_events (
  id          bigserial primary key,
  contact_id  uuid not null references contacts(id) on delete cascade,
  from_stage  lead_stage,
  to_stage    lead_stage not null,
  reason      text,
  actor       msg_author not null default 'system',
  created_at  timestamptz not null default now()
);
create index if not exists lead_events_contact_idx on lead_events(contact_id, created_at desc);

-- ---------- follow-ups (the "လိုက်စစ်ရမယ့်စာရင်း") ----------
create table if not exists follow_ups (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  due_at      timestamptz not null,
  reason      text not null,
  status      followup_status not null default 'pending',
  priority    int not null default 2,        -- 1 high, 2 normal, 3 low
  assigned_to text,
  created_by  msg_author not null default 'system',
  completed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists follow_ups_due_idx on follow_ups(status, due_at);
create unique index if not exists follow_ups_open_uidx
  on follow_ups(contact_id) where status = 'pending';

-- ---------- orders / sales ----------
create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  code        text unique,
  items       jsonb not null default '[]'::jsonb,
  amount      numeric(12,2) not null default 0,
  currency    text not null default 'MMK',
  status      text not null default 'pending',   -- pending|confirmed|delivered|cancelled|returned
  -- attribution snapshot so revenue still maps to an ad after the contact is edited
  ad_id       text,
  campaign_id text,
  confirmed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists orders_created_idx on orders(created_at desc);
create index if not exists orders_ad_idx on orders(ad_id);

-- ---------- product / FAQ knowledge base for the bot ----------
create table if not exists kb_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'faq',      -- faq | product | policy
  title       text not null,
  body        text not null,
  keywords    text[] not null default '{}',
  price       numeric(12,2),
  currency    text default 'MMK',
  in_stock    boolean default true,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists kb_active_idx on kb_items(is_active);

-- ---------- bot settings ----------
create table if not exists bot_settings (
  id                 int primary key default 1,
  is_enabled         boolean not null default true,
  business_name      text not null default 'My Shop',
  language           text not null default 'my',      -- my | en | mixed
  persona            text not null default 'Friendly, concise Burmese shop assistant.',
  greeting           text,
  handoff_keywords   text[] not null default array['complain','refund','ပြန်အမ်း','တိုင်','manager'],
  office_hours       text default '9:00-21:00',
  min_confidence     numeric(3,2) not null default 0.60,
  max_bot_turns      int not null default 6,          -- after N bot replies, hand to human
  follow_up_hours    int not null default 4,          -- silence before a follow-up task appears
  ghost_hours        int not null default 48,         -- silence before marked ghosted
  updated_at         timestamptz not null default now()
);
insert into bot_settings (id) values (1) on conflict (id) do nothing;

-- ---------- AI run log (cost + quality tracking) ----------
create table if not exists ai_runs (
  id            bigserial primary key,
  conversation_id uuid references conversations(id) on delete set null,
  model         text,
  intent        text,
  confidence    numeric(3,2),
  action        text,           -- replied | handoff | ignored
  handoff_reason text,
  input_tokens  int,
  output_tokens int,
  latency_ms    int,
  created_at    timestamptz not null default now()
);
create index if not exists ai_runs_created_idx on ai_runs(created_at desc);

-- ---------- ads ----------
create table if not exists ad_insights (
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
create index if not exists ad_insights_date_idx on ad_insights(date desc);

-- =====================================================================
-- Views the dashboard reads
-- =====================================================================

-- Per-day funnel: contacts in, real conversations, orders, revenue
create or replace view v_daily_funnel as
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
  from contacts ct
  left join conversations cv on cv.contact_id = ct.id
  group by 1
) c on c.day = d.day::date
left join (
  select date_trunc('day', created_at)::date as day,
         count(*) as orders,
         sum(amount) as revenue
  from orders where status in ('confirmed','delivered')
  group by 1
) o on o.day = d.day::date
left join (
  select date as day, sum(spend) as spend from ad_insights group by 1
) a on a.day = d.day::date;

-- Per-ad economics: spend vs leads vs sales
create or replace view v_ad_performance as
with spend as (
  select ad_id,
         max(ad_name) as ad_name,
         max(campaign_name) as campaign_name,
         min(date) as first_date,
         max(date) as last_date,
         sum(spend) as spend,
         sum(impressions) as impressions,
         sum(clicks) as clicks,
         sum(messaging_conversations_started) as meta_conversations
  from ad_insights group by ad_id
),
leads as (
  select source_ad_id as ad_id,
         count(*) as leads,
         count(*) filter (where stage in ('qualified','negotiating','ordered','won')) as qualified,
         count(*) filter (where stage = 'won') as won
  from contacts where source_ad_id is not null group by 1
),
sales as (
  select ad_id, count(*) as orders, sum(amount) as revenue
  from orders where status in ('confirmed','delivered') and ad_id is not null group by 1
)
select
  s.ad_id, s.ad_name, s.campaign_name, s.first_date, s.last_date,
  s.spend, s.impressions, s.clicks, s.meta_conversations,
  coalesce(l.leads,0) as leads,
  coalesce(l.qualified,0) as qualified_leads,
  coalesce(sa.orders,0) as orders,
  coalesce(sa.revenue,0) as revenue,
  case when coalesce(l.leads,0) > 0 then round(s.spend / l.leads, 2) end as cost_per_lead,
  case when coalesce(sa.orders,0) > 0 then round(s.spend / sa.orders, 2) end as cost_per_order,
  case when s.spend > 0 then round(coalesce(sa.revenue,0) / s.spend, 2) end as roas
from spend s
left join leads l on l.ad_id = s.ad_id
left join sales sa on sa.ad_id = s.ad_id;

-- The human work queue: who a person must personally handle right now
create or replace view v_needs_human as
select
  cv.id as conversation_id,
  ct.id as contact_id,
  ct.name, ct.psid, ct.stage, ct.phone,
  cv.status, cv.needs_human_reason, cv.needs_human_since,
  cv.last_message_at, cv.last_inbound_at,
  cv.inbound_count, cv.bot_reply_count, cv.human_reply_count,
  extract(epoch from (now() - cv.last_inbound_at))/60 as minutes_waiting
from conversations cv
join contacts ct on ct.id = cv.contact_id
where cv.status in ('needs_human','human_handling')
order by cv.needs_human_since nulls last, cv.last_inbound_at;

-- =====================================================================
-- RLS: everything is server-side via the service role key.
-- =====================================================================
alter table contacts       enable row level security;
alter table conversations  enable row level security;
alter table messages       enable row level security;
alter table lead_events    enable row level security;
alter table follow_ups     enable row level security;
alter table orders         enable row level security;
alter table kb_items       enable row level security;
alter table bot_settings   enable row level security;
alter table ai_runs        enable row level security;
alter table ad_insights    enable row level security;
