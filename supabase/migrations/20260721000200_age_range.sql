-- =============================================================================
-- ⚠ HISTORICAL — ALREADY APPLIED AND ALREADY REVERTED. DO NOT RE-APPLY. ⚠
--
-- Applied to production 2026-07-21. Fully reverted by
-- 20260805000000_retire_public_reflections_age_gate.sql on 2026-08-05, which runs
-- the rollback documented at the bottom of this file verbatim.
--
-- Confirmed against the live database on 2026-08-06, not inferred from the
-- migration history. public.users carries dropped-column tombstones at attnum
-- 13, 14 and 15 — immediately after ugc_accepted_at (attnum 12, added by
-- 20260719000200). Those three are age_range, age_attested_at and age_source.
-- Postgres keeps a dropped column's attnum forever, so their presence proves the
-- columns once existed, which proves this migration ran. Verify with:
--
--   SELECT attnum, attname, attisdropped FROM pg_attribute
--   WHERE attrelid='public.users'::regclass AND attnum > 0 ORDER BY attnum;
--
-- The absence of age_range and record_age_range() from the live schema is
-- therefore evidence of the 2026-08-05 revert, NOT evidence that this file was
-- never applied.
--
-- This file is kept rather than deleted because
-- 20260805000000_retire_public_reflections_age_gate.down.sql:32 cites it by line
-- range ("Verbatim from 20260721000200_age_range.sql:21-64") as the provenance
-- for the columns it restores. Deleting it would dangle that reference.
--
-- Re-applying this file would recreate the age-gate columns and
-- record_age_range() with EXECUTE granted to authenticated, contradicting
-- PrivacyInfo.xcprivacy in build 12, which declares no age-range collection.
-- Nothing in any client has read or written these since PR 469.
-- =============================================================================

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
