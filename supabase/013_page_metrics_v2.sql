-- Meta retired every *_impressions and *_reach metric. These are the columns
-- for what it still reports, so the dashboard stops showing honest zeros in
-- place of numbers that no longer exist.
alter table msgr_page_daily add column if not exists page_views bigint not null default 0;
alter table msgr_page_posts add column if not exists avg_watch_ms bigint not null default 0;
alter table msgr_page_posts add column if not exists view_time_ms bigint not null default 0;

notify pgrst, 'reload schema';
