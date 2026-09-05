-- ---------- Daily exchange rates ----------
-- The kyat moves day to day, so one fixed rate misstates every historical
-- figure. Rates are stored per date; a sale is converted at the rate in force
-- on the day it happened, not today's.

create table if not exists msgr_fx_rates (
  date        date primary key,
  mmk_per_usd numeric(12,2) not null check (mmk_per_usd > 0),
  note        text,
  updated_at  timestamptz not null default now()
);

alter table msgr_fx_rates enable row level security;

-- Seed from whatever the settings row already holds, so nothing breaks before
-- the first rate is entered by hand.
insert into msgr_fx_rates (date, mmk_per_usd, note)
select current_date, coalesce(mmk_per_usd, 4500), 'seeded from settings'
from msgr_settings limit 1
on conflict (date) do nothing;

/**
 * The rate in force on a given day: the most recent rate entered on or before
 * it. Before the first entry, fall back to the settings value — a stale rate
 * beats a division by null.
 */
create or replace function msgr_fx(d date) returns numeric
language sql stable as $$
  select coalesce(
    (select mmk_per_usd from msgr_fx_rates where date <= d order by date desc limit 1),
    (select mmk_per_usd from msgr_settings order by id limit 1),
    4500
  );
$$;

-- Sales, with each row also carrying its USD value at that day's rate.
create or replace view v_msgr_sales as
select
  l.contact_id,
  l.ad_id,
  l.campaign_id,
  s.id as sale_id,
  s.sale_ref,
  s.total,
  (s.total / msgr_fx(s.created_at::date))::numeric(14,2) as total_usd,
  s.order_status,
  s.store_id,
  s.created_at
from msgr_sale_links l
join sales s on s.id = l.sale_id
where coalesce(s.order_status, 'delivered') <> 'cancelled';

-- ROAS now compares like with like, day by day.
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

-- Daily rollup carries the USD revenue too.
create or replace view v_msgr_daily as
select
  d.day::date as day,
  coalesce(c.new_contacts, 0)      as new_contacts,
  coalesce(c.engaged_contacts, 0)  as engaged_contacts,
  coalesce(c.no_convo_contacts, 0) as no_convo_contacts,
  coalesce(o.orders, 0)            as orders,
  coalesce(o.revenue, 0)           as revenue,
  coalesce(o.revenue_usd, 0)       as revenue_usd,
  coalesce(a.spend, 0)             as spend
from generate_series(current_date - interval '180 days', current_date, interval '1 day') d
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
