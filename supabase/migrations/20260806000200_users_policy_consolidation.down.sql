-- =============================================================================
-- DOWN migration for 20260806000200_users_policy_consolidation.sql
--
-- Schema-clean AND fully data-lossless. Policies carry no data, and because the
-- consolidation was provably access-neutral, so is reverting it.
--
-- Restores all five policies to their exact pre-consolidation form. Note in
-- particular that users_update is recreated with NO WITH CHECK clause, so
-- pg_policies.with_check returns to NULL rather than to the explicit expression
-- the up migration wrote. That is the actual prior state; recreating it with the
-- explicit clause would leave the database in a third state that never existed.
--
-- The result is three SELECT policies and two UPDATE policies again, OR'd to the
-- same effective expression as before. Redundant, but that redundancy is what is
-- being restored.
--
-- Reverses in reverse order: survivors first, then the absorbed policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restore the two survivors to their original definitions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select"
  ON public.users FOR SELECT TO public
  USING ((id = auth.uid()) OR public.has_min_role('admin'));

-- No WITH CHECK — this is the point of the revert. Postgres will fall back to
-- reusing USING as the write check, which is the pre-consolidation behaviour.
DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update"
  ON public.users FOR UPDATE TO public
  USING ((id = auth.uid()) OR public.has_min_role('admin'));

-- ---------------------------------------------------------------------------
-- 2. Restore the three absorbed policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT TO public
  USING (public.has_min_role('admin'));

DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
CREATE POLICY "Users can read their own profile"
  ON public.users FOR SELECT TO public
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE TO public
  USING (id = auth.uid());
