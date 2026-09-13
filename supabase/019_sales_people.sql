-- ---------- Sales people ----------
-- Everyone shares one dashboard login, so `created_by` says "Page Admin" on
-- every order and answers nothing about who actually made the sale. This is
-- that answer, and it is a list the manager keeps — staff do not need accounts.

create table if not exists msgr_sales_people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  shop_id    uuid references msgr_shops(id),
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table msgr_sales_people enable row level security;

-- The name is copied onto the order as well as the id: a person can leave and
-- be removed from the list, and last year's orders must still say who sold them.
alter table msgr_orders
  add column if not exists sales_person_id   uuid references msgr_sales_people(id),
  add column if not exists sales_person_name text;

create index if not exists msgr_orders_seller_idx on msgr_orders(sales_person_id);

notify pgrst, 'reload schema';
