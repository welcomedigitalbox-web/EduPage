-- ---------- Page connection ----------
-- Until now the Page was wired up by pasting a token into Vercel, which meant
-- nobody but a developer could connect or re-connect it — and a reviewer could
-- not see the connection being made at all. The Page now lives in the database,
-- chosen by the admin from the list of Pages they manage.

alter table msgr_settings
  add column if not exists page_id           text,
  add column if not exists page_name         text,
  add column if not exists page_access_token text,
  add column if not exists page_connected_at timestamptz,
  add column if not exists page_connected_by text;

notify pgrst, 'reload schema';
