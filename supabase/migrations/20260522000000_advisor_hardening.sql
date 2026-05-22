-- =============================================================================
-- GraceChords: Supabase advisor warning remediation (2026-05-22)
--
-- Addresses three buckets of advisor WARN findings without behavior changes:
--   1. function_search_path_mutable (lint 0011) — re-apply SET search_path = ''
--      on 11 public functions. Idempotent ALTER FUNCTIONs in case earlier
--      migration 20260313 was not applied or was overwritten via the dashboard.
--   2. {anon,authenticated}_security_definer_function_executable (lint 0028/0029)
--      — REVOKE EXECUTE from anon / PUBLIC on functions not intended as RPC,
--      and from anon-only on the four functions intentionally callable by
--      signed-in users (delete_user, update_user_role, is_collaborator_eligible,
--      claim_contributor_invite, review_*). Trigger functions still fire under
--      the table owner regardless of EXECUTE grants.
--   3. rls_enabled_no_policy on song_suggestions (lint 0008) — the original
--      policies in 20260312_song_editor.sql referenced a `global_role` column
--      that has since been renamed to `role`, so policy creation likely failed
--      silently or the policies were dropped manually. Re-create them using
--      the public.has_min_role() helper.
--
-- Deferred (out of scope, documented in plan):
--   • extension_in_public (pg_trgm) — moving requires CASCADE drop of GIN
--     index and bot_search_songs; not zero-risk, deferred.
--   • auth_leaked_password_protection — Dashboard-only toggle.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Re-apply SET search_path = '' on flagged functions
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.update_updated_at()                    SET search_path = '';
ALTER FUNCTION public.set_updated_at()                       SET search_path = '';
ALTER FUNCTION public.update_song_star_count()               SET search_path = '';
ALTER FUNCTION public.get_user_role()                        SET search_path = '';
ALTER FUNCTION public.has_min_role(text)                     SET search_path = '';
ALTER FUNCTION public.is_global_admin()                      SET search_path = '';
ALTER FUNCTION public.is_collaborator_eligible()             SET search_path = '';
ALTER FUNCTION public.update_user_role(uuid, text)           SET search_path = '';
ALTER FUNCTION public.claim_contributor_invite(text)         SET search_path = '';

-- The two review functions take custom enum types. Use DO blocks so the
-- migration does not fail if the underlying enum names have changed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'review_contributor_request'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.review_contributor_request(uuid, public.request_status, text) SET search_path = ''''';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'review_song_proposal'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.review_song_proposal(uuid, public.proposal_status, text) SET search_path = ''''';
  END IF;
END$$;


-- ---------------------------------------------------------------------------
-- 2. REVOKE EXECUTE on SECURITY DEFINER functions not intended as RPC
-- ---------------------------------------------------------------------------

-- 2a. Internal helpers used only by RLS / other SECURITY DEFINER functions.
--     RLS evaluation does not go through the API GRANT system, so revoking
--     EXECUTE from anon / authenticated does NOT affect policies that call
--     these helpers.
REVOKE EXECUTE ON FUNCTION public.get_user_role()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_min_role(text)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_global_admin()      FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_global_editor'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_global_editor() FROM PUBLIC, anon, authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_team_member'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC, anon, authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
  END IF;
END$$;

-- 2b. Trigger-only functions — never invoked as RPC.
REVOKE EXECUTE ON FUNCTION public.update_song_star_count()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.songs_search_titles_refresh()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_personal_setlist_limit()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_team_setlist_limit()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_team_membership_limit()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_team_leader_limit()        FROM PUBLIC, anon, authenticated;

-- 2c. Functions intentionally callable by signed-in users — revoke from anon
--     and PUBLIC, keep for authenticated. RLS / internal guards already
--     enforce role-based authorization inside the function body.
REVOKE EXECUTE ON FUNCTION public.delete_user()                       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user()                       TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_user_role(uuid, text)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_user_role(uuid, text)        TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_collaborator_eligible()          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_collaborator_eligible()          TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_contributor_invite(text)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_contributor_invite(text)      TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'review_contributor_request'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.review_contributor_request(uuid, public.request_status, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.review_contributor_request(uuid, public.request_status, text) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'review_song_proposal'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.review_song_proposal(uuid, public.proposal_status, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.review_song_proposal(uuid, public.proposal_status, text) TO authenticated';
  END IF;
END$$;


-- ---------------------------------------------------------------------------
-- 3. Restore song_suggestions RLS policies
--    Original policies (20260312_song_editor.sql) referenced public.users.global_role,
--    a column that has since been renamed to `role`. Rewrite using the
--    public.has_min_role(text) helper so the policies survive future role
--    schema tweaks.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "collab_insert"     ON public.song_suggestions;
DROP POLICY IF EXISTS "read_suggestions"  ON public.song_suggestions;
DROP POLICY IF EXISTS "editor_update"     ON public.song_suggestions;

CREATE POLICY "collab_insert"
  ON public.song_suggestions FOR INSERT
  WITH CHECK (public.has_min_role('collaborator'));

CREATE POLICY "read_suggestions"
  ON public.song_suggestions FOR SELECT
  USING (
    suggested_by = auth.uid()
    OR public.has_min_role('editor')
  );

CREATE POLICY "editor_update"
  ON public.song_suggestions FOR UPDATE
  USING (public.has_min_role('editor'));
