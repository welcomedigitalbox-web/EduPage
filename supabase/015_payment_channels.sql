-- ---------- Payment channels ----------
-- KPay, Wave, AYA Pay, a bank account, plain cash — these change often enough
-- (accounts get closed, new wallets appear) that hard-coding them in the app
-- would mean a deploy every time. They live in a table the manager edits.

create table if not exists msgr_payment_channels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                       -- 'KBZPay'
  kind         text not null default 'wallet',      -- wallet | bank | cash
  account_name text,                                -- 'Edu Baby House'
  account_no   text,                                -- phone / account number
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

insert into msgr_payment_channels (name, kind, sort_order)
select * from (values
  ('KBZPay',   'wallet', 1),
  ('WavePay',  'wallet', 2),
  ('AYA Pay',  'wallet', 3),
  ('CB Pay',   'wallet', 4),
  ('KBZ Bank', 'bank',   5),
  ('AYA Bank', 'bank',   6),
  ('ငွေသား',    'cash',   7)
) as seed(name, kind, sort_order)
where not exists (select 1 from msgr_payment_channels);

alter table msgr_payment_channels enable row level security;

-- Which wallet the money actually came through, and the transfer reference the
-- customer sent, kept next to the order so finance can match them later.
alter table msgr_orders
  add column if not exists payment_channel_id uuid references msgr_payment_channels(id),
  add column if not exists payment_ref text;

create index if not exists msgr_orders_channel_idx on msgr_orders(payment_channel_id);

notify pgrst, 'reload schema';
