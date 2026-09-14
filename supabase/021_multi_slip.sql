-- ---------- Several payment slips per order ----------
-- A customer who pays in two transfers sends two screenshots, and one column
-- could only keep the last of them. `payment_slip_url` stays as the first
-- slip so anything still reading it keeps working.

alter table msgr_orders
  add column if not exists payment_slips jsonb not null default '[]'::jsonb;

update msgr_orders
   set payment_slips = to_jsonb(array[payment_slip_url])
 where payment_slip_url is not null
   and payment_slips = '[]'::jsonb;

notify pgrst, 'reload schema';
