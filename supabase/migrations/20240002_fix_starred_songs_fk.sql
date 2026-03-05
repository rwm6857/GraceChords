-- Drops any foreign-key constraint from user_starred_songs.song_id to a songs table.
-- The app serves songs from static files; song_id is a plain text slug, not a DB foreign key.
-- This migration is idempotent: it does nothing if no such constraint exists.

do $$
declare
  _constraint text;
begin
  select conname into _constraint
  from pg_constraint
  where conrelid = 'public.user_starred_songs'::regclass
    and contype  = 'f'
    and conkey   = array[
      (select attnum
       from   pg_attribute
       where  attrelid = 'public.user_starred_songs'::regclass
         and  attname  = 'song_id')
    ];

  if _constraint is not null then
    execute format('alter table public.user_starred_songs drop constraint %I', _constraint);
    raise notice 'Dropped FK constraint % from user_starred_songs.song_id', _constraint;
  else
    raise notice 'No FK constraint found on user_starred_songs.song_id — nothing to drop';
  end if;
end;
$$;
