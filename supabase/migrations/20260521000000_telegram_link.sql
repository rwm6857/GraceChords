-- =============================================================================
-- GraceChords: Telegram account linking (2026-05-21)
-- Adds the per-user fields needed for @gracechords_bot to identify a Telegram
-- DM sender as a signed-up GraceChords user. The values are written by the
-- /api/telegram/link Pages Function after verifying the Login Widget HMAC.
-- =============================================================================

alter table public.users
  add column if not exists telegram_user_id   bigint,
  add column if not exists telegram_linked_at timestamptz;

-- One Telegram account links to at most one GraceChords user.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname  = 'users_telegram_user_id_key'
  ) then
    alter table public.users
      add constraint users_telegram_user_id_key unique (telegram_user_id);
  end if;
end $$;

-- Hot path: Telegram → users lookup on every DM. Partial index keeps it lean.
create index if not exists idx_users_telegram_user_id
  on public.users (telegram_user_id)
  where telegram_user_id is not null;
