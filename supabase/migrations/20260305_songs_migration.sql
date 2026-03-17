-- =============================================================================
-- GraceChords: Songs DB migration (2026-03-05)
-- Creates the songs table, wires up user_starred_songs as a UUID FK,
-- adds RLS policies, and installs a star_count maintenance trigger.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. SONGS TABLE
-- ---------------------------------------------------------------------------
-- Uses CREATE TABLE IF NOT EXISTS so it is safe to run even if the table was
-- created manually in the Supabase dashboard.

create table if not exists public.songs (
  id               uuid        primary key default gen_random_uuid(),
  slug             text        unique not null,   -- URL-safe id, e.g. "10-000-reasons"
  title            text        not null,
  artist           text,                          -- comma-separated string
  default_key      text,
  tags             text[]      not null default '{}',
  country          text,
  youtube_id       text,                          -- bare video ID, not a full URL
  source_filename  text,                          -- original .chordpro filename stem (e.g. "all_thats_within_me")
  chordpro_content text,
  star_count       integer     not null default 0,
  song_group_id    uuid,                          -- set manually when translation pairs are linked
  pptx_url         text,
  mp3_url          text,
  tempo            integer,
  time_signature   text,
  is_deleted       boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 1a. Columns that may already exist if the table was created earlier
--     (also covers the case where songs was created manually without some columns)
alter table public.songs add column if not exists slug             text;
alter table public.songs add column if not exists artist           text;
alter table public.songs add column if not exists default_key      text;
alter table public.songs add column if not exists tags             text[] not null default '{}';
alter table public.songs add column if not exists country          text;
alter table public.songs add column if not exists youtube_id       text;
alter table public.songs add column if not exists source_filename  text;
alter table public.songs add column if not exists chordpro_content text;
alter table public.songs add column if not exists star_count       integer not null default 0;
alter table public.songs add column if not exists song_group_id    uuid;
alter table public.songs add column if not exists pptx_url         text;
alter table public.songs add column if not exists mp3_url          text;
alter table public.songs add column if not exists tempo            integer;
alter table public.songs add column if not exists time_signature   text;
alter table public.songs add column if not exists is_deleted       boolean not null default false;
alter table public.songs add column if not exists created_at       timestamptz not null default now();
alter table public.songs add column if not exists updated_at       timestamptz not null default now();

-- 1b. Indexes
-- Ensure slug has a unique index (required for upsert onConflict: 'slug').
-- Drop a pre-existing non-unique index first so we can recreate it as unique.
drop index if exists public.songs_slug_idx;
create unique index if not exists songs_slug_idx   on public.songs (slug);
create index if not exists songs_song_group_id_idx on public.songs (song_group_id);
create index if not exists songs_title_idx         on public.songs (title);

-- 1c. RLS
alter table public.songs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'Songs are publicly readable'
  ) then
    create policy "Songs are publicly readable"
      on public.songs for select
      using (is_deleted = false);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. FIX user_starred_songs — change song_id from TEXT → UUID FK
-- ---------------------------------------------------------------------------
-- The current schema stores a plain text slug in song_id.  We now need a UUID
-- FK pointing at songs.id.  Since the starring feature has been broken (no
-- songs table), we truncate the stale rows, change the column type, recreate
-- the primary key, and add the FK.

-- 2a. Drop old primary key (it depends on the song_id column type)
alter table public.user_starred_songs
  drop constraint if exists user_starred_songs_pkey;

-- 2b. Remove any leftover FK on song_id (idempotent)
do $$
declare _constraint text;
begin
  select conname into _constraint
  from   pg_constraint
  where  conrelid = 'public.user_starred_songs'::regclass
    and  contype  = 'f'
    and  conkey   = array[
           (select attnum from pg_attribute
            where  attrelid = 'public.user_starred_songs'::regclass
              and  attname  = 'song_id')
         ];
  if _constraint is not null then
    execute format('alter table public.user_starred_songs drop constraint %I', _constraint);
  end if;
end;
$$;

-- 2c. Remove any existing rows (they reference slug strings, not UUIDs —
--     the starring feature was broken, so this data is not valid).
truncate public.user_starred_songs;

-- 2d. Change column type
alter table public.user_starred_songs
  alter column song_id type uuid using song_id::uuid;

-- 2e. Restore primary key
alter table public.user_starred_songs
  add primary key (user_id, song_id);

-- 2f. Add FK to songs
alter table public.user_starred_songs
  add constraint user_starred_songs_song_id_fkey
  foreign key (song_id) references public.songs(id) on delete cascade;


-- ---------------------------------------------------------------------------
-- 3. RLS POLICIES for user_starred_songs
-- ---------------------------------------------------------------------------
-- Drop old policies by their original names, then recreate with canonical names.

drop policy if exists "users can view own stars"   on public.user_starred_songs;
drop policy if exists "users can insert own stars" on public.user_starred_songs;
drop policy if exists "users can delete own stars" on public.user_starred_songs;
drop policy if exists "Users can view own starred songs" on public.user_starred_songs;
drop policy if exists "Users can star songs"           on public.user_starred_songs;
drop policy if exists "Users can unstar songs"         on public.user_starred_songs;

create policy "Users can view own starred songs"
  on public.user_starred_songs for select
  using (user_id = auth.uid());

create policy "Users can star songs"
  on public.user_starred_songs for insert
  with check (user_id = auth.uid());

create policy "Users can unstar songs"
  on public.user_starred_songs for delete
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 4. STAR COUNT TRIGGER
-- ---------------------------------------------------------------------------

create or replace function public.update_song_star_count()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    update public.songs set star_count = star_count + 1 where id = NEW.song_id;
  elsif (TG_OP = 'DELETE') then
    update public.songs set star_count = greatest(star_count - 1, 0) where id = OLD.song_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_starred_song_change on public.user_starred_songs;

create trigger on_starred_song_change
  after insert or delete on public.user_starred_songs
  for each row execute function public.update_song_star_count();
