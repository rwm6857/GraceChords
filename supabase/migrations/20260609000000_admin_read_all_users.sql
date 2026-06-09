-- =============================================================================
-- GraceChords: Fix Admin Portal user list — repair RLS helper functions
--
-- Symptom: GET /rest/v1/users (the Admin Portal user list) failed with HTTP 404
--   { code: 42883, message: "function get_user_role() does not exist" }
-- while the profile page (a single-row read filtered by id = auth.uid()) worked.
--
-- Root cause: the live public.has_min_role() / public.get_user_role() bodies
-- were defined with `SET search_path = ''` but referenced each other (and
-- auth.uid() / public.users) WITHOUT schema qualification. Under an empty
-- search_path an unqualified `get_user_role()` cannot resolve, raising 42883.
-- The full-table admin scan forces has_min_role('admin') to be evaluated for
-- rows where id <> auth.uid(); the profile read short-circuits on id = auth.uid()
-- and never hits the broken function, which is why only the admin list failed.
--
-- Fix: re-create both helpers with fully schema-qualified bodies (matching
-- supabase/migrations/20260313_fix_function_search_paths.sql, which the live
-- DB had drifted from). search_path stays '' for the Advisor 0011 lint.
--
-- Also drop the redundant "Admins can view all users" SELECT policy added in an
-- earlier revision of this migration: the pre-existing `users_select` policy
-- ((id = auth.uid()) OR has_min_role('admin')) already grants admin read access.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_min_role(min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE public.get_user_role()
    WHEN 'owner'        THEN true
    WHEN 'admin'        THEN min_role IN ('admin','editor','collaborator','user')
    WHEN 'editor'       THEN min_role IN ('editor','collaborator','user')
    WHEN 'collaborator' THEN min_role IN ('collaborator','user')
    WHEN 'user'         THEN min_role = 'user'
    ELSE false
  END;
$$;

-- Helpers are invoked during RLS evaluation, so the caller needs EXECUTE.
GRANT EXECUTE ON FUNCTION public.get_user_role()    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_min_role(text) TO anon, authenticated;

-- Remove the redundant policy added earlier; users_select already covers admins.
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
