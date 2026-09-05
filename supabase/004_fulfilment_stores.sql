-- =====================================================================
-- Online sales are not tied to one shop. The bot quotes the pooled stock
-- of every fulfilment store, and the order is routed to whichever shop
-- actually has the item — normally the one in the customer's city.
-- =====================================================================

alter table msgr_settings
  add column if not exists fulfilment_store_ids text[] not null default '{}';

-- Carry the old single-store setting over so nothing breaks on deploy.
update msgr_settings
   set fulfilment_store_ids = array[default_store_id]
 where default_store_id is not null
   and cardinality(fulfilment_store_ids) = 0;

notify pgrst, 'reload schema';

select default_store_id, fulfilment_store_ids from msgr_settings where id = 1;
