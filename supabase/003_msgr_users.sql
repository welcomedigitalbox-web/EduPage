-- =====================================================================
-- Dashboard accounts for the Messenger app.
--
-- Deliberately NOT the POS `profiles` table: the people who answer
-- Messenger are not always the people who work the till, and a Messenger
-- agent should never inherit POS permissions by accident.
-- =====================================================================

do $$ begin
  create type msgr_role as enum ('agent', 'manager');
exception when duplicate_object then null; end $$;

create table if not exists msgr_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text,
  password_hash text not null,
  role          msgr_role not null default 'agent',
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists msgr_users_active_idx on msgr_users(is_active);

-- Only the app's server (service role) ever touches this table.
alter table msgr_users enable row level security;

-- Who replied, recorded against the conversation.
alter table msgr_conversations add column if not exists assigned_user_id uuid references msgr_users(id) on delete set null;
