-- =============================================================================
-- GraceChords: age assurance for Shared Reflections (2026-07-21)
--
-- Records the user's self-declared / OS-declared age RANGE so the client can keep
-- users under 13 out of the public Shared Reflections feed (Apple "Social Media"
-- + "Disabled for Under 13" declarations). No birthdate is stored — only a coarse
-- range bucket and when/how it was attested.
--
-- Written through a SECURITY DEFINER RPC (never a raw client UPDATE) for the same
-- reason as accept_ugc_terms: the base public.users table + its column
-- grants/policies are provisioned out-of-band, so the RPC is the verifiable write
-- path. It only ever touches the caller's own row and validates its inputs.
-- Reading age_range is a normal own-row select via the existing users_select
-- policy.
--
-- Enforcement is client-side this pass (the feed/compose surfaces gate on the
-- stored range); the moderated submit endpoint + feed RLS are intentionally left
-- unchanged. Forward-only + idempotent. Documented rollback at the bottom.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_range text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_attested_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_source text;

-- Constrain to the known buckets/sources without failing on legacy NULLs.
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

-- Set the caller's age range + attestation metadata and return the stored range.
-- Unlike accept_ugc_terms this OVERWRITES on each call (a correction, or a child
-- who has since turned 13, should update). auth.uid() scopes it to the caller.
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

-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   DROP FUNCTION IF EXISTS public.record_age_range(text, text);
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_age_range_check;
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_age_source_check;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS age_source;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS age_attested_at;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS age_range;
-- =============================================================================
