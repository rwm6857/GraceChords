-- =============================================================================
-- DOWN migration for 20260805000000_retire_public_reflections_age_gate.sql
--
-- WARNING — schema-clean but NOT data-lossless.
--
-- The up migration DROPs three columns from public.users. Restoring them here
-- brings them back as all-NULL: every recorded age attestation (age_range,
-- age_attested_at, age_source) is destroyed by the up migration and cannot be
-- recovered from this file. Users who had attested will read as never having
-- attested, so any client that gated on the stored range would re-prompt.
--
-- The other two changes ARE fully restorable: the kill-switch flip is one boolean
-- and public_feed_read is recreated verbatim below.
--
-- Only run this if the public "Shared Reflections" feature is being deliberately
-- brought back. Note that restoring the read policy and the flag re-exposes
-- today's public reflections to anon, and re-enables the service-role write path
-- in functions/api/reflections/submit.js — the exact surface App Review rejected
-- under Guideline 1.2. The client code it served no longer exists (PR 469 also
-- narrowed ReflectionVisibility to 'private'), so this alone does not bring the
-- feature back; it only reopens the backend.
--
-- Reverses in reverse order: age gate, then read policy, then flag.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restore the age-gate columns, constraints and RPC
--
-- Verbatim from 20260721000200_age_range.sql:21-64. Columns come back NULL —
-- see the warning above.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_range text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_attested_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_age_range_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_age_range_check
      CHECK (age_range IS NULL OR age_range IN ('under_13', '13_plus'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_age_source_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_age_source_check
      CHECK (age_source IS NULL OR age_source IN ('self', 'declared_api'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_age_range(p_range text, p_source text DEFAULT 'self')
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_range NOT IN ('under_13', '13_plus') THEN
    RAISE EXCEPTION 'invalid age range: %', p_range;
  END IF;
  IF p_source NOT IN ('self', 'declared_api') THEN
    RAISE EXCEPTION 'invalid age source: %', p_source;
  END IF;
  UPDATE public.users
    SET age_range = p_range,
        age_source = p_source,
        age_attested_at = now()
    WHERE id = auth.uid();
  RETURN (SELECT age_range FROM public.users WHERE id = auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.record_age_range(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_age_range(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Restore the public-feed read policy
--
-- Verbatim from 20260719000100_public_reflections_backend.sql:127-134. Depends
-- on feature_enabled() and is_user_banned(), which the up migration left in
-- place, so this needs no other file re-applied first.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_feed_read" ON public.reflections;
CREATE POLICY "public_feed_read" ON public.reflections FOR SELECT USING (
  visibility = 'public'
  AND removed_at IS NULL
  AND reflection_date = current_date
  AND public.feature_enabled('public_reflections')
  AND NOT public.is_user_banned(user_id)
);

-- ---------------------------------------------------------------------------
-- 3. Turn the public_reflections kill switch back ON
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, enabled)
VALUES ('public_reflections', true)
ON CONFLICT (key) DO UPDATE SET enabled = true;
