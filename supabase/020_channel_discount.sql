-- ---------- Order channel + percentage discounts ----------

-- Where the order came from. Today everything arrives through Messenger, but
-- the shop also takes orders on the phone, at the counter and from comments,
-- and a report that calls all of it "Messenger" is wrong the day that starts.
create table if not exists msgr_order_channels (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into msgr_order_channels (name, sort_order)
select * from (values
  ('Messenger', 1),
  ('Facebook comment', 2),
  ('Phone', 3),
  ('Viber', 4),
  ('TikTok', 5),
  ('Walk-in', 6)
) as seed(name, sort_order)
where not exists (select 1 from msgr_order_channels);

alter table msgr_order_channels enable row level security;

alter table msgr_orders
  add column if not exists order_channel_id   uuid references msgr_order_channels(id),
  add column if not exists order_channel_name text,
  -- `discount` stays the money taken off, so every view and report keeps
  -- working. These two only record how that figure was arrived at.
  add column if not exists discount_type  text not null default 'amount',
  add column if not exists discount_value numeric(14,2) not null default 0;

create index if not exists msgr_orders_channel_src_idx on msgr_orders(order_channel_id);

-- Everything taken so far came through Messenger.
update msgr_orders o
   set order_channel_id = c.id, order_channel_name = c.name
  from msgr_order_channels c
 where c.name = 'Messenger' and o.order_channel_id is null;

-- And the discounts entered so far were all plain amounts.
update msgr_orders
   set discount_value = discount
 where discount_value = 0 and discount > 0;

notify pgrst, 'reload schema';
