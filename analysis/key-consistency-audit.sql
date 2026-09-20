-- Songs whose ChordPro {key:} directive disagrees with their default_key column.
--
-- WHY THIS MATTERS (QA report Nº 7327, S-02)
--
-- Every key shown in a list or card now reads as "orig → work" when a stored
-- working key differs from the song's own — see apps/mobile/src/lib/keyDisplay.ts.
-- The "orig" side comes from songs.default_key, but the "work" side is computed
-- by the Viewer against its NATIVE key, which is:
--
--     doc?.meta?.key || song?.default_key        (app/viewer/[slug].tsx)
--
-- i.e. the ChordPro {key:} directive wins when present. So for any song where the
-- two disagree, a stored transposition is measured from the ChordPro key while
-- the row's "orig" is read from the column, and the pair renders against two
-- different reference points — "C → D" where the user actually transposed from D.
--
-- The display is still honest about both values, which is exactly why the pair
-- form was chosen over silently replacing the key. But the rows this returns are
-- worth reconciling at the source.
--
-- SAFE TO RUN: read-only. No writes, no schema change.
--
-- Run in the Supabase SQL editor. If it returns no rows, nothing to do and the
-- concern is closed.

with parsed as (
  select
    id,
    slug,
    title,
    default_key,
    -- First {key: ...} / {k: ...} directive, case-insensitive, whitespace
    -- trimmed. ChordPro allows both the long and short form.
    nullif(
      trim(
        (regexp_match(
           coalesce(chordpro_content, ''),
           '\{\s*(?:key|k)\s*:\s*([^}]*)\}',
           'i'
         ))[1]
      ),
      ''
    ) as chordpro_key
  from public.songs
)
select
  slug,
  title,
  default_key          as column_key,
  chordpro_key,
  case
    when chordpro_key is null           then 'no {key:} directive — column is authoritative, fine'
    when default_key  is null           then 'column empty, ChordPro has a key'
    when upper(trim(default_key)) = upper(chordpro_key) then 'match'
    else 'MISMATCH — transposition is measured from the ChordPro key'
  end as verdict
from parsed
where chordpro_key is not null
  and (
    default_key is null
    or upper(trim(default_key)) <> upper(chordpro_key)
  )
order by verdict desc, slug;

-- Count only, if you just want to know whether this is a real problem:
--
--   select count(*) from public.songs
--   where (regexp_match(coalesce(chordpro_content, ''), '\{\s*(?:key|k)\s*:\s*([^}]*)\}', 'i'))[1]
--         is not null
--     and upper(trim(coalesce(default_key, ''))) <>
--         upper(trim((regexp_match(coalesce(chordpro_content, ''), '\{\s*(?:key|k)\s*:\s*([^}]*)\}', 'i'))[1]));
--
-- Personal songs carry the same two fields (public.personal_songs) — swap the
-- table name to audit those too.
