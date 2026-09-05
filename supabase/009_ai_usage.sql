-- Cache reads bill at a fraction of normal input, so they have to be counted
-- separately or every cost figure is wrong by ~5x.
alter table msgr_ai_runs add column if not exists cache_read_tokens  int not null default 0;
alter table msgr_ai_runs add column if not exists cache_write_tokens int not null default 0;

create or replace view v_msgr_ai_usage_daily as
select
  (created_at at time zone 'Asia/Yangon')::date as day,
  coalesce(model, 'unknown')                    as model,
  count(*)                                      as runs,
  count(*) filter (where action = 'handoff')    as handoffs,
  sum(coalesce(input_tokens, 0))                as input_tokens,
  sum(coalesce(output_tokens, 0))               as output_tokens,
  sum(cache_read_tokens)                        as cache_read_tokens,
  sum(cache_write_tokens)                       as cache_write_tokens,
  round(avg(coalesce(latency_ms, 0)))           as avg_latency_ms
from msgr_ai_runs
group by 1, 2;

notify pgrst, 'reload schema';
