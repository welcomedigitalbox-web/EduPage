-- Ad spend arrives in the ad account's own currency (USD here) while POS
-- revenue is in MMK. ROAS needs one rate to reconcile them, and the dashboard
-- needs to know which currency to print.
alter table msgr_settings add column if not exists ad_currency text default 'USD';
alter table msgr_settings add column if not exists mmk_per_usd numeric(12,2) default 4500;

notify pgrst, 'reload schema';

-- ROAS was dividing MMK revenue by USD spend. Convert first.
create or replace view v_msgr_ad_performance as
with fx as (
  select coalesce(max(mmk_per_usd), 4500)::numeric as rate from msgr_settings
),
spend as (
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
  case when s.spend > 0
       then round((coalesce(r.revenue,0) / (select rate from fx)) / s.spend, 2) end as roas
from spend s
left join leads l on l.ad_id = s.ad_id
left join rev r on r.ad_id = s.ad_id
order by s.spend desc;

notify pgrst, 'reload schema';
