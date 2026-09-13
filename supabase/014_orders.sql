-- ---------- Standalone online orders ----------
-- The shop is not on the POS yet, so orders live here in full. The ad that
-- produced the order is copied onto the order at the moment it is created —
-- attribution must not depend on the contact record still being intact months
-- later.

create table if not exists msgr_shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text,
  address     text,
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

insert into msgr_shops (name, region, address, sort_order)
select * from (values
  ('ရန်ကုန် ဆိုင်ခွဲ (၁)', 'Yangon',
   'ဗိုလ်အောင်ကျော်လမ်း (အောက်ဘလောက်)၊ ကုန်သည်လမ်းထောင့်၊ ကျောက်တံတားမြို့နယ်', 1),
  ('ရန်ကုန် ဆိုင်ခွဲ (၂)', 'Yangon',
   'ဝေဇယန္တာလမ်းမကြီးပေါ်၊ လေးထောင့်ကန်လမ်းမအနီး၊ မိချောင်းကန် (၁) ရပ်ကွက်၊ သင်္ဃန်းကျွန်းမြို့နယ်', 2),
  ('ရန်ကုန် ဆိုင်ခွဲ (၃)', 'Yangon',
   'အမှတ် ၈၆၊ သုဓမ္မာလမ်းမကြီး၊ ၂ ရပ်ကွက်၊ မြောက်ဥက္ကလာပမြို့နယ်', 3),
  ('မန္တလေး ဆိုင်ခွဲ (၁)', 'Mandalay',
   '၂၉ လမ်း၊ ၇၉×၈၀ ကြား၊ မန္တလေးမြို့', 4)
) as seed(name, region, address, sort_order)
where not exists (select 1 from msgr_shops);

create table if not exists msgr_orders (
  id                uuid primary key default gen_random_uuid(),
  -- Human-facing reference staff can say out loud on the phone.
  order_no          bigint generated always as identity,
  contact_id        uuid references msgr_contacts(id) on delete set null,
  conversation_id   uuid references msgr_conversations(id) on delete set null,

  customer_name     text not null,
  phone             text,
  city              text,
  delivery_address  text,

  shop_id           uuid references msgr_shops(id),

  order_date        date not null default (now() at time zone 'Asia/Yangon')::date,
  delivery_method   text,
  payment_method    text not null default 'cod',   -- cod | transfer | prepaid
  advance_payment   numeric(14,2) not null default 0,
  delivery_fee      numeric(14,2) not null default 0,
  discount          numeric(14,2) not null default 0,
  subtotal          numeric(14,2) not null default 0,
  grand_total       numeric(14,2) not null default 0,

  status            text not null default 'pending',
    -- pending | confirmed | packed | shipped | delivered | cancelled
  note              text,

  -- Attribution, frozen at creation time.
  source_type       text,
  source_ad_id      text,
  source_campaign_id text,

  created_by        uuid references msgr_users(id) on delete set null,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists msgr_orders_date_idx   on msgr_orders(order_date desc);
create index if not exists msgr_orders_status_idx on msgr_orders(status);
create index if not exists msgr_orders_ad_idx     on msgr_orders(source_ad_id);
create index if not exists msgr_orders_contact_idx on msgr_orders(contact_id);

create table if not exists msgr_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references msgr_orders(id) on delete cascade,
  barcode      text,
  description  text not null,
  unit_price   numeric(14,2) not null default 0,
  qty          numeric(12,2) not null default 1,
  line_total   numeric(14,2) not null default 0,
  sort_order   int not null default 0
);
create index if not exists msgr_order_items_order_idx on msgr_order_items(order_id);

alter table msgr_shops       enable row level security;
alter table msgr_orders      enable row level security;
alter table msgr_order_items enable row level security;

-- ---------- reporting ----------
-- Everything downstream reads sales through this view, so pointing it at the
-- new table is all it takes for the reports, ROAS and overview to start
-- counting these orders. Cancelled orders are excluded, as before.
--
-- The column types change, which Postgres will not do in place, so the view is
-- dropped and rebuilt along with the two views that read from it.
drop view if exists v_msgr_daily cascade;
drop view if exists v_msgr_ad_performance cascade;
drop view if exists v_msgr_sales cascade;

-- Both sources feed the same view, so POS sales and orders taken here are
-- counted together — and `channel` keeps them separable when that matters.
create view v_msgr_sales as
select
  o.contact_id,
  o.source_ad_id                                   as ad_id,
  o.source_campaign_id                             as campaign_id,
  o.id                                             as sale_id,
  ('EBH-' || lpad(o.order_no::text, 5, '0'))       as sale_ref,
  o.grand_total::numeric                           as total,
  (o.grand_total / msgr_fx(o.order_date))::numeric as total_usd,
  o.status                                         as order_status,
  o.shop_id::text                                  as store_id,
  o.created_at,
  'online'::text                                   as channel
from msgr_orders o
where o.status <> 'cancelled'

union all

select
  l.contact_id,
  l.ad_id,
  l.campaign_id,
  s.id                                             as sale_id,
  s.sale_ref,
  s.total::numeric                                 as total,
  (s.total / msgr_fx(s.created_at::date))::numeric as total_usd,
  s.order_status,
  s.store_id::text,
  s.created_at,
  'pos'::text                                      as channel
from msgr_sale_links l
join sales s on s.id = l.sale_id
where coalesce(s.order_status, 'delivered') <> 'cancelled';

create view v_msgr_ad_performance as
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
  select ad_id, count(*) as orders,
         sum(total) as revenue, sum(total_usd) as revenue_usd
  from v_msgr_sales where ad_id is not null group by 1
)
select
  s.ad_id, s.ad_name, s.campaign_name, s.first_date, s.last_date,
  s.spend, s.impressions, s.clicks, s.meta_conversations,
  coalesce(l.leads,0) as leads,
  coalesce(l.qualified,0) as qualified_leads,
  coalesce(r.orders,0) as orders,
  coalesce(r.revenue,0) as revenue,
  coalesce(r.revenue_usd,0) as revenue_usd,
  case when coalesce(l.leads,0) > 0 then round(s.spend / l.leads, 2) end as cost_per_lead,
  case when coalesce(r.orders,0) > 0 then round(s.spend / r.orders, 2) end as cost_per_order,
  case when s.spend > 0 then round(coalesce(r.revenue_usd,0) / s.spend, 2) end as roas
from spend s
left join leads l on l.ad_id = s.ad_id
left join rev r on r.ad_id = s.ad_id
order by s.spend desc;

create view v_msgr_daily as
select
  d.day::date as day,
  coalesce(c.new_contacts, 0)      as new_contacts,
  coalesce(c.engaged_contacts, 0)  as engaged_contacts,
  coalesce(c.no_convo_contacts, 0) as no_convo_contacts,
  coalesce(o.orders, 0)            as orders,
  coalesce(o.revenue, 0)           as revenue,
  coalesce(o.revenue_usd, 0)       as revenue_usd,
  coalesce(a.spend, 0)             as spend
from generate_series(current_date - interval '180 days', current_date, interval '1 day') as d(day)
left join (
  select first_seen_at::date as day,
         count(*) as new_contacts,
         count(*) filter (where stage <> 'new') as engaged_contacts,
         count(*) filter (where stage = 'new') as no_convo_contacts
  from msgr_contacts group by 1
) c on c.day = d.day::date
left join (
  select created_at::date as day, count(*) as orders,
         sum(total) as revenue, sum(total_usd) as revenue_usd
  from v_msgr_sales group by 1
) o on o.day = d.day::date
left join (
  select date as day, sum(spend) as spend from msgr_ad_daily group by 1
) a on a.day = d.day::date;

notify pgrst, 'reload schema';
