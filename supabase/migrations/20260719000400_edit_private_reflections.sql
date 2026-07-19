-- =============================================================================
-- GraceChords: allow editing PRIVATE reflections (2026-07-19)
--
-- The original reflections table shipped with NO update policy on purpose — the
-- no-edit rule was a DB invariant. Product has since decided private reflections
-- should be editable (a personal journal entry the owner revises), so this adds
-- a tightly-scoped UPDATE policy.
--
-- Public reflections stay IMMUTABLE:
--   * USING restricts the rows an update can touch to the caller's own PRIVATE
--     rows, so a public post can never be edited.
--   * WITH CHECK forces the post-update row to still be the caller's own and
--     still 'private', so an edit can neither change the owner nor flip a private
--     row to 'public' (which would bypass moderation entirely — public rows may
--     only be created by the service-role submit path).
--   * heart_count on public rows is unaffected: this policy never applies to
--     public rows, and the count trigger remains SECURITY DEFINER.
--
-- Forward-only + idempotent, per repo convention.
-- =============================================================================

DROP POLICY IF EXISTS "own_update_private" ON public.reflections;

CREATE POLICY "own_update_private" ON public.reflections
  FOR UPDATE
  USING (user_id = auth.uid() AND visibility = 'private')
  WITH CHECK (user_id = auth.uid() AND visibility = 'private');

-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   DROP POLICY IF EXISTS "own_update_private" ON public.reflections;
-- =============================================================================
