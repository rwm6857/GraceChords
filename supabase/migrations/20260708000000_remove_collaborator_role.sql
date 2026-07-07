-- =============================================================================
-- GraceChords: Remove the `collaborator` role + the request system (2026-07-08)
--
-- Role hierarchy becomes: user → editor → admin → owner. The 7-day
-- self-service collaborator request flow is retired (maintainers promote
-- manually), and all users can now submit songs for review (see the
-- song_suggestions RLS migration). Existing `collaborator` users are demoted to
-- `user` — no privilege escalation, and their only power (suggesting) is now
-- universal.
--
-- Written idempotently against the LIVE DB (which has drifted from the
-- migration files): guards + CREATE OR REPLACE throughout.
-- =============================================================================

-- 1. Demote existing collaborators BEFORE narrowing the helper CASE arms.
UPDATE public.users SET role = 'user' WHERE role = 'collaborator';

-- 2. Retire the request system (table, its policies/indexes, and the RPC).
DROP TABLE IF EXISTS public.collaborator_requests CASCADE;
DROP FUNCTION IF EXISTS public.is_collaborator_eligible();

-- 3. Narrow the role-hierarchy helper (drop the 'collaborator' arm/targets).
CREATE OR REPLACE FUNCTION public.has_min_role(min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE public.get_user_role()
    WHEN 'owner'  THEN true
    WHEN 'admin'  THEN min_role IN ('admin','editor','user')
    WHEN 'editor' THEN min_role IN ('editor','user')
    WHEN 'user'   THEN min_role = 'user'
    ELSE false
  END;
$$;
GRANT EXECUTE ON FUNCTION public.has_min_role(text) TO anon, authenticated;

-- 4. Drop 'collaborator' from the role-assignment RPC whitelist.
CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role         text := public.get_user_role();
  target_current_role text;
BEGIN
  IF new_role NOT IN ('owner','admin','editor','user') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  SELECT role INTO target_current_role
  FROM public.users WHERE id = target_user_id;

  IF new_role IN ('owner','admin') AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Insufficient privileges to assign role: %', new_role;
  END IF;

  IF caller_role = 'admin' AND new_role NOT IN ('editor','user') THEN
    RAISE EXCEPTION 'Admins can only assign editor or user roles';
  END IF;

  IF target_current_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot modify an owner account';
  END IF;

  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_user_role(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated;

-- 5. Drop the redundant 'collaborator' arm from the personal-setlist limit
--    trigger (collaborator shared editor's cap of 50; the ELSE already covers it).
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

  IF v_role = 'owner' THEN
    RETURN NEW;  -- no cap
  END IF;

  v_limit := CASE v_role
    WHEN 'user'   THEN 30
    WHEN 'editor' THEN 50
    WHEN 'admin'  THEN 50
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
