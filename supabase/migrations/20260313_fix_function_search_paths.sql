-- =============================================================================
-- GraceChords: Security hardening — add SET search_path = '' to all public
-- schema functions that are missing it (Supabase Advisor lint 0011).
--
-- IMPORTANT: Functions marked "NEEDS MANUAL VERIFICATION" below were NOT found
-- in any existing migration file and are reconstructed from codebase context.
-- Before running this migration, open the Supabase Dashboard → Database →
-- Functions, find each marked function, and confirm the signature and body
-- match what is written here.  If they differ, update this file first.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. update_updated_at
--    Source: supabase/migrations/20260312_posts.sql (verified)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. update_song_star_count
--    Source: supabase/migrations/20260305_songs_migration.sql (verified)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_song_star_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.songs SET star_count = star_count + 1 WHERE id = NEW.song_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.songs SET star_count = greatest(star_count - 1, 0) WHERE id = OLD.song_id;
  END IF;
  RETURN NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. set_updated_at
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: second updated_at trigger function (same pattern as
--    update_updated_at).  Verify exact body in the Supabase Dashboard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. get_user_role
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: returns role text for auth.uid() from public.users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT role
    FROM public.users
    WHERE id = auth.uid()
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. has_min_role
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: checks whether auth.uid()'s role is >= the supplied minimum
--    role in the hierarchy user < collaborator < editor < admin < owner.
--    Used in RLS policies (e.g. collaborator_requests).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_min_role(min_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role  text;
  role_order text[] := ARRAY['user','collaborator','editor','admin','owner'];
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid();

  RETURN (
    array_position(role_order, COALESCE(user_role, 'user')) >=
    array_position(role_order, min_role)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. current_user_global_role
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: returns global_role text for auth.uid() from public.users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_global_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT global_role
    FROM public.users
    WHERE id = auth.uid()
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. is_global_editor
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: returns true if current user's global_role is editor/admin/owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_global_editor()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND global_role IN ('editor', 'admin', 'owner')
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. is_global_admin
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: returns true if current user's global_role is admin/owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND global_role IN ('admin', 'owner')
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 9. is_collaborator_eligible
--    NEEDS MANUAL VERIFICATION — not found in migration files.
--    Inferred: returns true if auth.uid()'s account is >= 7 days old.
--    (Documented in src/components/CollaboratorRequest.jsx.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_collaborator_eligible()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND account_created_at <= (now() - INTERVAL '7 days')
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 10. get_set_limit
--     NEEDS MANUAL VERIFICATION — not found in migration files.
--     Inferred: returns the saved-set cap for the current user's role.
--     Limits mirror SET_LIMITS in src/pages/SetlistPage.jsx:
--       owner=unlimited(2^31-1), admin/editor=30, collaborator=25, user=10.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_set_limit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid();

  RETURN CASE COALESCE(user_role, 'user')
    WHEN 'owner'        THEN 2147483647
    WHEN 'admin'        THEN 30
    WHEN 'editor'       THEN 30
    WHEN 'collaborator' THEN 25
    ELSE                     10
  END;
END;
$$;


-- ---------------------------------------------------------------------------
-- 11. enforce_set_limit
--     NEEDS MANUAL VERIFICATION — not found in migration files.
--     Inferred: BEFORE INSERT trigger on public.saved_sets that raises
--     'SET_LIMIT_REACHED' when the user's set count reaches get_set_limit().
--     (Error string referenced in src/pages/SetlistPage.jsx.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_set_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
  set_limit     integer;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM public.saved_sets
  WHERE user_id = NEW.user_id;

  set_limit := public.get_set_limit();

  IF current_count >= set_limit THEN
    RAISE EXCEPTION 'SET_LIMIT_REACHED';
  END IF;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 12. update_user_role
--     NEEDS MANUAL VERIFICATION — not found in migration files.
--     Inferred: updates a target user's role; called from AdminPage.jsx with
--     params (target_user_id uuid, new_role text).  Likely enforces that the
--     caller has sufficient privilege to assign the requested role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_role(
  target_user_id uuid,
  new_role       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.users
  SET    role = new_role
  WHERE  id   = target_user_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- 13. claim_contributor_invite
--     NEEDS MANUAL VERIFICATION — not found in migration files.
--     No call-site found in the frontend; body below is a placeholder.
--     Fetch the exact definition from the Supabase Dashboard before running.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_contributor_invite()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- TODO: replace this placeholder with the actual function body from the
  --       Supabase Dashboard (Database → Functions → claim_contributor_invite).
  RAISE EXCEPTION 'claim_contributor_invite: body not yet populated — see migration comments';
END;
$$;


-- ---------------------------------------------------------------------------
-- 14. review_contributor_request
--     NEEDS MANUAL VERIFICATION — not found in migration files.
--     No call-site found in the frontend; body below is a placeholder.
--     Fetch the exact definition from the Supabase Dashboard before running.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_contributor_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- TODO: replace this placeholder with the actual function body from the
  --       Supabase Dashboard (Database → Functions → review_contributor_request).
  RAISE EXCEPTION 'review_contributor_request: body not yet populated — see migration comments';
END;
$$;


-- ---------------------------------------------------------------------------
-- 15. review_song_proposal
--     NEEDS MANUAL VERIFICATION — not found in migration files.
--     No call-site found in the frontend; body below is a placeholder.
--     Fetch the exact definition from the Supabase Dashboard before running.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_song_proposal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- TODO: replace this placeholder with the actual function body from the
  --       Supabase Dashboard (Database → Functions → review_song_proposal).
  RAISE EXCEPTION 'review_song_proposal: body not yet populated — see migration comments';
END;
$$;
