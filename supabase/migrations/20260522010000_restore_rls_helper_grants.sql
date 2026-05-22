-- =============================================================================
-- GraceChords: Restore EXECUTE on RLS helper functions (2026-05-22, hotfix)
--
-- Previous migration 20260522000000_advisor_hardening.sql revoked EXECUTE on
-- get_user_role / has_min_role / is_global_admin / is_global_editor /
-- is_team_member from anon + authenticated. This broke RLS evaluation on
-- every table whose policies call these helpers (e.g. users,
-- collaborator_requests, song_suggestions) because the caller still needs
-- EXECUTE to invoke a SECURITY DEFINER function — being SECURITY DEFINER
-- only controls what the function does once invoked, not whether the role
-- is allowed to invoke it.
--
-- Symptom: 403 on /rest/v1/users and /rest/v1/contributor_requests; profile
-- page stuck on loading.
--
-- Fix: re-grant EXECUTE on these helpers to authenticated and anon.
-- They return only the caller's own role / bool derived from auth.uid(),
-- so exposing them as RPC is a low-impact tradeoff — the advisor will
-- reinstate those specific warnings, which is acceptable.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_user_role()    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_min_role(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_global_admin()  TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_global_editor'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_global_editor() TO anon, authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_team_member'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO anon, authenticated';
  END IF;
END$$;
