-- ---------- Retail or wholesale ----------
-- The same shop sells single items to parents and cases to resellers, and
-- mixing the two makes every average — basket size, margin, repeat rate —
-- describe nobody. Existing orders were all retail.

alter table msgr_orders
  add column if not exists sale_type text not null default 'retail';

create index if not exists msgr_orders_sale_type_idx on msgr_orders(sale_type);

notify pgrst, 'reload schema';
