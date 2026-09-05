-- =====================================================================
-- CRM fields on a Messenger contact.
--
-- The master customer record stays in the POS `customers` table so the
-- till can find people by phone or email and loyalty keeps working.
-- These columns hold what we learn BEFORE the contact is promoted to a
-- POS customer, plus the Messenger-only routing choices.
-- =====================================================================

alter table msgr_contacts add column if not exists email text;
alter table msgr_contacts add column if not exists city text;
alter table msgr_contacts add column if not exists preferred_rep_id uuid references sales_reps(id) on delete set null;

create index if not exists msgr_contacts_email_idx on msgr_contacts(email);
create index if not exists msgr_contacts_phone_idx on msgr_contacts(phone);

notify pgrst, 'reload schema';
