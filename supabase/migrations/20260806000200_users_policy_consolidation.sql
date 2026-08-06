-- =============================================================================
-- GraceChords: consolidate the redundant public.users policies (2026-08-06)
--
-- Live state has three SELECT policies and two UPDATE policies on public.users.
-- All five are PERMISSIVE, all target {public}, and all have with_check = NULL.
-- Permissive policies OR together. Writing S = (id = auth.uid()) and
-- A = has_min_role('admin'):
--
--   SELECT
--     "Admins can view all users"          A
--     "Users can read their own profile"   S
--     users_select                         (S OR A)
--     effective:  A ∨ S ∨ (S ∨ A)  ≡  S ∨ A
--
--   UPDATE
--     "Users can update their own profile" S
--     users_update                         (S OR A)
--     effective:  S ∨ (S ∨ A)      ≡  S ∨ A
--
-- In both cases the effective expression is ALREADY LITERALLY the survivor's
-- qual. The dropped policies are each a single disjunct of a survivor, so
-- absorption applies (X ∨ (X ∨ Y) ≡ X ∨ Y) and access is unchanged in both
-- directions: no row that was readable becomes unreadable, and no row that was
-- unreadable becomes readable.
--
-- Three things could have broken that argument, and all three were checked
-- against pg_policies rather than assumed:
--
--   * a RESTRICTIVE policy would AND rather than OR, so dropping it would WIDEN
--     access. There is none — all five report PERMISSIVE.
--   * differing `roles` targets would mean the survivor had to carry the union.
--     All five report {public}, so there is nothing to widen.
--   * a qual that did not match its policy name would change the algebra.
--     Each was read from pg_policies.qual directly, not inferred from the name.
--
-- This matters here specifically: overlapping permissive policies are the
-- mechanism that nearly leaked user reflections earlier this year, and AGENTS.md:80
-- warns about exactly this. Hence the explicit argument rather than an assertion.
--
-- No INSERT policy is added — handle_new_user() is SECURITY DEFINER and is the
-- only provisioning path. users_delete is left in place; 20260806000500 revokes
-- the underlying DELETE grant, which is what actually closes it.
--
-- Forward-only + idempotent. Fully reversible and data-lossless.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the three absorbed policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all users"          ON public.users;
DROP POLICY IF EXISTS "Users can read their own profile"   ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- ---------------------------------------------------------------------------
-- 2. Recreate the two survivors, with an EXPLICIT WITH CHECK on the UPDATE
--    policy.
--
-- The WITH CHECK expression is identical to USING, which is exactly what Postgres
-- already substitutes when with_check is NULL — so this is a semantic no-op
-- today. It is written out so that a future widening of USING cannot silently
-- widen the write check along with it.
--
-- To be precise about what this does NOT do: the null WITH CHECK was not the root
-- of the role escalation. USING (id = auth.uid()) constrains WHICH ROW is
-- updated, never WHICH COLUMNS change, so even with an explicit identical
-- WITH CHECK the role column was still freely writable by anyone holding the
-- column grant. The root was the table-wide UPDATE grant.
-- guard_users_role_change() closed it; 20260806000500 closes it again at the
-- privilege layer. This clause is legibility, not the fix.
--
-- It must be (S ∨ A), not (S). Narrowing to (S) would revoke admins' ability to
-- update other users' rows — a behaviour change, not a consolidation. Nothing in
-- any client relies on that admin arm (the Admin Portal writes only through
-- SECURITY DEFINER RPCs), so narrowing it is defensible on its own merits, but it
-- belongs in its own migration where it can be smoke-tested as a change.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select"
  ON public.users FOR SELECT TO public
  USING ((id = auth.uid()) OR public.has_min_role('admin'));

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update"
  ON public.users FOR UPDATE TO public
  USING      ((id = auth.uid()) OR public.has_min_role('admin'))
  WITH CHECK ((id = auth.uid()) OR public.has_min_role('admin'));
