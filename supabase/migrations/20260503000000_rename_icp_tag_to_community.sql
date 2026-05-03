-- Rename the "ICP" tag to "Community" on every song that carries it.
--
-- Behavior:
--   * Matches ICP case-insensitively (handles 'ICP', 'icp', 'Icp', etc.).
--   * Replaces it with the canonical label 'Community'.
--   * Preserves the relative order of the other tags (via WITH ORDINALITY).
--   * Leaves every other tag value untouched.
--   * Skips rows that don't contain an ICP tag.
--   * If a song already has both 'ICP' and 'Community', the resulting array
--     is deduped so we don't introduce a duplicate 'Community' entry.

BEGIN;

WITH affected AS (
  SELECT id, tags
  FROM public.songs
  WHERE EXISTS (
    SELECT 1 FROM unnest(tags) AS t WHERE lower(t) = 'icp'
  )
),
expanded AS (
  SELECT
    a.id AS song_id,
    CASE WHEN lower(u.tag) = 'icp' THEN 'Community' ELSE u.tag END AS tag,
    u.ord
  FROM affected a,
       unnest(a.tags) WITH ORDINALITY AS u(tag, ord)
),
deduped AS (
  SELECT
    song_id,
    tag,
    MIN(ord) AS first_ord
  FROM expanded
  GROUP BY song_id, tag
),
rebuilt AS (
  SELECT
    song_id,
    array_agg(tag ORDER BY first_ord) AS new_tags
  FROM deduped
  GROUP BY song_id
)
UPDATE public.songs AS s
SET tags = rebuilt.new_tags
FROM rebuilt
WHERE s.id = rebuilt.song_id;

COMMIT;
