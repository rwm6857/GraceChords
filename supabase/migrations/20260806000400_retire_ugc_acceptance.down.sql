-- =============================================================================
-- DOWN migration for 20260806000400_retire_ugc_acceptance.sql
--
-- WARNING — schema-clean but NOT data-lossless.
--
-- The up migration DROPs public.users.ugc_accepted_at. Restoring it here brings
-- it back as all-NULL: every recorded acceptance timestamp is destroyed by the up
-- migration and cannot be recovered from this file. Users who had accepted the
-- UGC terms will read as never having accepted, so any client that gated on the
-- stored value would re-prompt.
--
-- Note also that the restored column occupies a NEW attnum at the end of the
-- table. The dropped one leaves a tombstone that never goes away. This is
-- invisible to every client and to PostgREST, but it means the physical layout
-- does not return to exactly what it was.
--
-- The function IS fully restorable and is recreated verbatim below.
--
-- Both objects come back from 20260719000200_ugc_acceptance.sql:19-34. Restoring
-- them does not revive the Shared Reflections feature: PR 469 deleted the client
-- code and narrowed ReflectionVisibility to 'private', and 20260805000000 turned
-- the public_reflections flag off and dropped public_feed_read. This reopens one
-- unused write path, nothing more.
--
-- Reverses in reverse order: column, then function.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restore the column. Comes back NULL for every row — see the warning above.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ugc_accepted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Restore the RPC, verbatim from 20260719000200_ugc_acceptance.sql:23-34
--    (identical to the live definition captured before the drop).
--
-- COALESCE keeps the original acceptance time if called more than once, and
-- auth.uid() scopes the write to the caller's own row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_ugc_terms()
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ts timestamptz := now();
BEGIN
  UPDATE public.users
    SET ugc_accepted_at = COALESCE(ugc_accepted_at, v_ts)
    WHERE id = auth.uid();
  RETURN (SELECT ugc_accepted_at FROM public.users WHERE id = auth.uid());
END $function$;

REVOKE ALL    ON FUNCTION public.accept_ugc_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ugc_terms() TO authenticated, service_role;
