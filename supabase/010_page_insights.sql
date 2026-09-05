-- ---------- Page-level insights ----------
-- Business Suite numbers, kept locally so the dashboard is fast and so the
-- history survives Meta's own 2-year retention window.

create table if not exists msgr_page_daily (
  date              date primary key,
  impressions       bigint not null default 0,
  reach             bigint not null default 0,
  engagements       bigint not null default 0,
  video_views       bigint not null default 0,
  new_follows       bigint not null default 0,
  followers_total   bigint,
  fans_total        bigint,
  updated_at        timestamptz not null default now()
);

create table if not exists msgr_page_posts (
  post_id       text primary key,
  created_time  timestamptz not null,
  message       text,
  permalink     text,
  media_type    text,
  impressions   bigint not null default 0,
  reach         bigint not null default 0,
  reactions     bigint not null default 0,
  comments      bigint not null default 0,
  shares        bigint not null default 0,
  video_views   bigint not null default 0,
  clicks        bigint not null default 0,
  updated_at    timestamptz not null default now()
);
create index if not exists msgr_page_posts_time_idx on msgr_page_posts(created_time desc);

alter table msgr_page_daily enable row level security;
alter table msgr_page_posts enable row level security;

notify pgrst, 'reload schema';
