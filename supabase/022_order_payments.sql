-- ---------- Money actually received ----------
-- "Paid or not" is not a flag someone sets, it is the sum of what came in.
-- A COD order is unpaid until the delivery company hands the cash over, and
-- that can arrive days later, in one lump or in parts — so receipts are rows,
-- and the order carries their total.

create table if not exists msgr_order_payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references msgr_orders(id) on delete cascade,
  amount       numeric(14,2) not null,
  channel_id   uuid references msgr_payment_channels(id),
  channel_name text,
  ref          text,
  slips        jsonb not null default '[]'::jsonb,
  paid_at      date not null default (now() at time zone 'Asia/Yangon')::date,
  note         text,
  actor_id     uuid references msgr_users(id) on delete set null,
  actor_name   text,
  created_at   timestamptz not null default now()
);

create index if not exists msgr_order_payments_order_idx
  on msgr_order_payments(order_id, paid_at desc);

alter table msgr_order_payments enable row level security;

alter table msgr_orders
  add column if not exists amount_received numeric(14,2) not null default 0;

-- The advance recorded when the order was taken is money that was received.
update msgr_orders
   set amount_received = advance_payment
 where amount_received = 0 and advance_payment > 0;

-- And it becomes the first receipt row, so the history is not missing its
-- opening entry.
insert into msgr_order_payments (order_id, amount, channel_id, channel_name, ref, slips, paid_at, note)
select o.id, o.advance_payment, o.payment_channel_id,
       c.name, o.payment_ref, coalesce(o.payment_slips, '[]'::jsonb),
       o.order_date, 'advance at order'
  from msgr_orders o
  left join msgr_payment_channels c on c.id = o.payment_channel_id
 where o.advance_payment > 0
   and not exists (select 1 from msgr_order_payments p where p.order_id = o.id);

create index if not exists msgr_orders_received_idx on msgr_orders(amount_received);

notify pgrst, 'reload schema';
