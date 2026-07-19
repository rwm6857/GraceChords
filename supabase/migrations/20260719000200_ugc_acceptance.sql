-- =============================================================================
-- GraceChords: UGC (Shared Reflections) terms acceptance (Phase 2B, 2026-07-19)
--
-- Records when a user accepted the Shared Reflections user-generated-content
-- terms (Apple Guideline 1.2 EULA). A user cannot post a PUBLIC reflection until
-- this is set; the client gates public compose on it and re-checks on launch.
--
-- Acceptance is written through a SECURITY DEFINER RPC rather than a direct
-- client UPDATE: the base public.users table and its self-UPDATE policy/column
-- grants are provisioned out-of-band (not in these migrations), so a raw client
-- write to a NEW top-level column is unverifiable from version control. The RPC
-- guarantees the write, only ever touches the caller's own row, and matches the
-- house pattern (public.delete_user). Reading ugc_accepted_at is a normal own-row
-- select via the existing users_select policy.
--
-- Forward-only + idempotent. Documented rollback at the bottom.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ugc_accepted_at timestamptz;

-- Set the caller's acceptance timestamp once (coalesce keeps the original accept
-- time if called again) and return it. auth.uid() scopes it to the caller.
CREATE OR REPLACE FUNCTION public.accept_ugc_terms()
  RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ts timestamptz := now();
BEGIN
  UPDATE public.users
    SET ugc_accepted_at = COALESCE(ugc_accepted_at, v_ts)
    WHERE id = auth.uid();
  RETURN (SELECT ugc_accepted_at FROM public.users WHERE id = auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.accept_ugc_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ugc_terms() TO authenticated;

-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   DROP FUNCTION IF EXISTS public.accept_ugc_terms();
--   ALTER TABLE public.users DROP COLUMN IF EXISTS ugc_accepted_at;
-- =============================================================================
