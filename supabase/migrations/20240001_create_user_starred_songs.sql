-- Creates the user_starred_songs table with song_id as plain TEXT (no FK to a songs table).
-- Songs are served from static files in this app; there is no songs DB table.
-- Using TEXT for song_id stores the slug (e.g. "10-000-reasons") directly.

create table if not exists public.user_starred_songs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  song_id    text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- Enable row-level security so users can only access their own stars.
alter table public.user_starred_songs enable row level security;

-- Users can read their own stars.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_starred_songs'
      and policyname = 'users can view own stars'
  ) then
    create policy "users can view own stars"
      on public.user_starred_songs for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Users can insert their own stars.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_starred_songs'
      and policyname = 'users can insert own stars'
  ) then
    create policy "users can insert own stars"
      on public.user_starred_songs for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Users can delete their own stars.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_starred_songs'
      and policyname = 'users can delete own stars'
  ) then
    create policy "users can delete own stars"
      on public.user_starred_songs for delete
      using (auth.uid() = user_id);
  end if;
end $$;
