-- ---------- Payment and delivery tracks ----------
-- One overall status could not answer "is the money in?" and "has it shipped?"
-- at the same time, so the two questions get a column each. Both move
-- pending → processing → done, and only a manager may move one backwards.

alter table msgr_orders
  add column if not exists payment_status   text not null default 'pending',
  add column if not exists delivery_status  text not null default 'pending',
  add column if not exists payment_slip_url text;

create index if not exists msgr_orders_paystatus_idx on msgr_orders(payment_status);
create index if not exists msgr_orders_delstatus_idx on msgr_orders(delivery_status);

-- Who moved what, so a disputed order has a trail rather than an argument.
create table if not exists msgr_order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references msgr_orders(id) on delete cascade,
  track      text not null,              -- payment | delivery | order
  from_state text,
  to_state   text not null,
  actor_id   uuid references msgr_users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists msgr_order_events_order_idx on msgr_order_events(order_id, created_at desc);

alter table msgr_order_events enable row level security;

notify pgrst, 'reload schema';
