-- =============================================================================
-- GraceChords: Fix "infinite recursion detected in policy for relation
-- team_members" (2026-07-07, hotfix)
--
-- Symptom: creating or listing setlists fails in both apps with
--   "infinite recursion detected in policy for relation team_members".
--
-- Root cause: the RLS policies from 20260316000000_setlist_teams_redesign.sql
-- query public.team_members from *inside* team_members' own policies
-- (team_members_select / team_members_delete). Evaluating those policies
-- re-triggers RLS on team_members, which Postgres reports as infinite
-- recursion. Every other setlist-domain policy (teams, setlists,
-- setlist_songs, setlist_comments) subqueries team_members too, so the error
-- surfaces on any of those tables — including the plain personal-setlist
-- insert path, because createSetlist() does insert(...).select(...) and the
-- returned row is checked against setlists_select.
--
-- The live DB previously masked this via an ad-hoc SECURITY DEFINER helper
-- public.is_team_member(uuid) (referenced conditionally by
-- 20260522000000_advisor_hardening.sql and 20260522010000_restore_rls_helper_grants.sql)
-- plus dashboard-edited policies that were never captured in a migration, so
-- re-applying the repo's canonical policies reinstated the recursion.
--
-- Fix: define the membership helpers canonically as SECURITY DEFINER
-- functions (they bypass RLS on team_members, breaking the cycle) and rebuild
-- every setlist-domain policy on top of them. Semantics are unchanged from
-- the redesign migration; only the recursion is removed.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Drop all existing policies on the setlist-domain tables.
--    Policy names may have drifted on the live DB (dashboard hotfixes), so
--    enumerate pg_policies instead of dropping fixed names. This also clears
--    any dependency on the ad-hoc is_team_member(uuid) so it can be dropped
--    and recreated with a canonical body below.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('teams', 'team_members', 'setlists', 'setlist_songs', 'setlist_comments')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Membership helpers (SECURITY DEFINER → bypass RLS on team_members).
--    DROP + CREATE rather than CREATE OR REPLACE: the live DB's ad-hoc
--    is_team_member(uuid) may use a different parameter name, which
--    CREATE OR REPLACE cannot change.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_team_member(uuid);
CREATE FUNCTION public.is_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = auth.uid()
  );
$$;

DROP FUNCTION IF EXISTS public.is_team_leader(uuid);
CREATE FUNCTION public.is_team_leader(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'leader'
  );
$$;

-- RLS evaluation runs these as the querying role, so authenticated (and anon,
-- for consistency with 20260522010000_restore_rls_helper_grants.sql) need
-- EXECUTE. SECURITY DEFINER only affects the *body's* table access.
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_team_leader(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_team_member(uuid) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_team_leader(uuid) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Rebuild policies (same semantics as the redesign migration, minus the
--    recursion). RLS is already enabled on all five tables.
-- ---------------------------------------------------------------------------

-- ── teams ───────────────────────────────────────────────────────────────────

CREATE POLICY "teams_select"
  ON public.teams FOR SELECT
  USING (
    created_by = auth.uid()          -- creator can read back the row before the
    OR public.is_team_member(id)     -- leader membership row is inserted
  );

CREATE POLICY "teams_insert"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "teams_update"
  ON public.teams FOR UPDATE
  USING (created_by = auth.uid() OR public.is_team_leader(id));

CREATE POLICY "teams_delete"
  ON public.teams FOR DELETE
  USING (created_by = auth.uid() OR public.is_team_leader(id));


-- ── team_members ─────────────────────────────────────────────────────────────

CREATE POLICY "team_members_select"
  ON public.team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_team_member(team_id)
  );

CREATE POLICY "team_members_insert"
  ON public.team_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "team_members_delete"
  ON public.team_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_team_leader(team_id)
  );


-- ── setlists ────────────────────────────────────────────────────────────────

CREATE POLICY "setlists_select"
  ON public.setlists FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

CREATE POLICY "setlists_insert"
  ON public.setlists FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "setlists_update"
  ON public.setlists FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND edit_mode = 'edit'
      AND public.is_team_member(team_id)
    )
  );

CREATE POLICY "setlists_delete"
  ON public.setlists FOR DELETE
  USING (owner_id = auth.uid());


-- ── setlist_songs ────────────────────────────────────────────────────────────

-- SELECT: same access as parent setlist
CREATE POLICY "setlist_songs_select"
  ON public.setlist_songs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (sl.team_id IS NOT NULL AND public.is_team_member(sl.team_id))
        )
    )
  );

-- INSERT / UPDATE / DELETE: same as setlist UPDATE rules
CREATE POLICY "setlist_songs_insert"
  ON public.setlist_songs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND sl.edit_mode = 'edit'
            AND public.is_team_member(sl.team_id)
          )
        )
    )
  );

CREATE POLICY "setlist_songs_update"
  ON public.setlist_songs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND sl.edit_mode = 'edit'
            AND public.is_team_member(sl.team_id)
          )
        )
    )
  );

CREATE POLICY "setlist_songs_delete"
  ON public.setlist_songs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND sl.edit_mode = 'edit'
            AND public.is_team_member(sl.team_id)
          )
        )
    )
  );


-- ── setlist_comments ─────────────────────────────────────────────────────────

CREATE POLICY "setlist_comments_select"
  ON public.setlist_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_comments.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (sl.team_id IS NOT NULL AND public.is_team_member(sl.team_id))
        )
    )
  );

CREATE POLICY "setlist_comments_insert"
  ON public.setlist_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_comments.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (sl.team_id IS NOT NULL AND public.is_team_member(sl.team_id))
        )
    )
  );

CREATE POLICY "setlist_comments_delete"
  ON public.setlist_comments FOR DELETE
  USING (user_id = auth.uid());
