-- =============================================================================
-- GraceChords: Make account deletion succeed for suggestion authors/reviewers
-- (song_suggestions FK ON DELETE repair, 2026-07-03)
--
-- Context: delete_user() (and admin_delete_user()) delete the row from
-- auth.users and rely on FK cascades to clean up dependent rows. Every
-- user-referencing FK cascades or nulls EXCEPT the two on song_suggestions:
--
--   song_suggestions.suggested_by -> public.users(id)   (no ON DELETE clause)
--   song_suggestions.reviewed_by  -> public.users(id)   (no ON DELETE clause)
--
-- A missing ON DELETE clause defaults to NO ACTION, so when auth.users ->
-- public.users cascades, these two constraints block the delete with a foreign
-- key violation (SQLSTATE 23503) for any user who has submitted or reviewed a
-- suggestion. The mobile "Delete account" and web Profile "Delete account" both
-- fail with "Delete failed" for those users.
--
-- Fix: switch both FKs to ON DELETE SET NULL, matching how the other
-- actor/author references already behave (posts.author_id,
-- editor_audit_log.actor_id). The suggestion/review record is preserved (an
-- editor may still need to act on a pending suggestion); only the link to the
-- deleted user is cleared. Both columns are already nullable.
--
-- Idempotent: discovers the actual FK constraint on each column (guarding
-- against name drift) and recreates it with the correct ON DELETE action.
-- =============================================================================

DO $$
DECLARE
  _con text;
BEGIN
  -- suggested_by
  SELECT conname INTO _con
  FROM   pg_constraint
  WHERE  conrelid = 'public.song_suggestions'::regclass
    AND  contype  = 'f'
    AND  conkey   = ARRAY[(
           SELECT attnum FROM pg_attribute
           WHERE  attrelid = 'public.song_suggestions'::regclass
             AND  attname  = 'suggested_by'
         )];
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.song_suggestions DROP CONSTRAINT %I', _con);
  END IF;

  ALTER TABLE public.song_suggestions
    ADD CONSTRAINT song_suggestions_suggested_by_fkey
    FOREIGN KEY (suggested_by) REFERENCES public.users(id) ON DELETE SET NULL;

  -- reviewed_by
  SELECT conname INTO _con
  FROM   pg_constraint
  WHERE  conrelid = 'public.song_suggestions'::regclass
    AND  contype  = 'f'
    AND  conkey   = ARRAY[(
           SELECT attnum FROM pg_attribute
           WHERE  attrelid = 'public.song_suggestions'::regclass
             AND  attname  = 'reviewed_by'
         )];
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.song_suggestions DROP CONSTRAINT %I', _con);
  END IF;

  ALTER TABLE public.song_suggestions
    ADD CONSTRAINT song_suggestions_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
END $$;
