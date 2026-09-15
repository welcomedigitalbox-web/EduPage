-- ---------- Keep the order's paid state true no matter who writes ----------
-- Until now `amount_received`, `payment_status` and `status` were recomputed in
-- the dashboard's API route. A second application writing straight to
-- msgr_order_payments would leave every one of them stale. The rule belongs to
-- the database, so it holds for whoever inserts the row.

create or replace function msgr_sync_order_payment()
returns trigger
language plpgsql
as $$
declare
  v_order   uuid := coalesce(new.order_id, old.order_id);
  v_total   numeric;
  v_got     numeric;
  v_pay     text;
  v_del     text;
  v_status  text;
begin
  select coalesce(sum(amount), 0) into v_got
    from msgr_order_payments where order_id = v_order;

  select grand_total, coalesce(delivery_status, 'pending'), status
    into v_total, v_del, v_status
    from msgr_orders where id = v_order;

  -- A rounding-sized shortfall is not an unpaid order.
  v_pay := case
    when v_total > 0 and v_got >= v_total - 0.5 then 'done'
    when v_got > 0 then 'processing'
    else 'pending'
  end;

  update msgr_orders
     set amount_received = v_got,
         payment_status  = v_pay,
         status = case
           when v_status = 'cancelled' then 'cancelled'
           when v_del = 'done' then 'delivered'
           when v_del = 'processing' then 'shipped'
           when v_pay in ('done', 'processing') then 'confirmed'
           else 'pending'
         end,
         updated_at = now()
   where id = v_order;

  return null;
end;
$$;

drop trigger if exists msgr_order_payments_sync on msgr_order_payments;
create trigger msgr_order_payments_sync
  after insert or update or delete on msgr_order_payments
  for each row execute function msgr_sync_order_payment();

-- Bring every order in line with the receipts it already has.
update msgr_orders o
   set amount_received = coalesce(p.total, 0)
  from (select order_id, sum(amount) as total
          from msgr_order_payments group by order_id) p
 where p.order_id = o.id;

-- ---------- What finance reads ----------
-- One row per order with the money already worked out, so another application
-- never has to re-implement the arithmetic — or get it subtly different.
create or replace view v_msgr_receivables as
select
  o.id                as order_id,
  ('EBH-' || lpad(o.order_no::text, 5, '0')) as order_ref,
  o.order_date,
  o.customer_name,
  o.phone,
  o.city,
  o.delivery_address,
  o.delivery_method,
  s.name              as shop,
  o.sales_person_name,
  o.order_channel_name,
  o.sale_type,
  o.payment_method,
  o.status,
  o.payment_status,
  o.delivery_status,
  o.subtotal,
  o.discount,
  o.delivery_fee,
  o.grand_total,
  o.amount_received,
  greatest(o.grand_total - o.amount_received, 0) as balance_due,
  case
    when o.grand_total > 0 and o.amount_received >= o.grand_total - 0.5 then 'paid'
    when o.amount_received > 0 then 'partial'
    else 'unpaid'
  end                 as payment_state,
  o.source_type,
  o.source_ad_id,
  o.created_at,
  o.updated_at
from msgr_orders o
left join msgr_shops s on s.id = o.shop_id
where o.status <> 'cancelled';

notify pgrst, 'reload schema';
