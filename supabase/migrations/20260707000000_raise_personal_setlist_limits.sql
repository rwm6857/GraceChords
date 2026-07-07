-- =============================================================================
-- GraceChords: Raise per-role personal setlist limits (2026-07-07)
--
-- Replaces the body of public.check_personal_setlist_limit() defined in
-- 20260316000000_setlist_teams_redesign.sql. The old caps (user 3,
-- collaborator 5, editor 10, admin 20, owner 30) were too low. New policy:
--   • user                          → 30
--   • collaborator / editor / admin → 50
--   • owner                         → unlimited
--
-- Team setlist / membership / leadership limits are unchanged.
--
-- CREATE OR REPLACE preserves the function's existing grants (the REVOKEs from
-- 20260522000000_advisor_hardening.sql), but we re-assert them below so this
-- migration is self-contained if applied against a drifted DB.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_personal_setlist_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role  text;
  v_limit int;
  v_count int;
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    RETURN NEW;  -- handled by team limit trigger
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = NEW.owner_id;

  -- Owner has no cap.
  IF v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  v_limit := CASE v_role
    WHEN 'user'         THEN 30
    WHEN 'collaborator' THEN 50
    WHEN 'editor'       THEN 50
    WHEN 'admin'        THEN 50
    ELSE 30
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.setlists
  WHERE owner_id = NEW.owner_id AND team_id IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PERSONAL_SETLIST_LIMIT_REACHED: limit % for role %', v_limit, v_role;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_personal_setlist_limit() FROM PUBLIC, anon, authenticated;
