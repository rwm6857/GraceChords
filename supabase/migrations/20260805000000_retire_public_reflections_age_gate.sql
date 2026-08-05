-- =============================================================================
-- GraceChords: retire the public "Shared Reflections" backend + the age gate
-- (2026-08-05)
--
-- App Review rejected 1.0.0 (11) under Guideline 1.2 (anonymous user-generated
-- content) and 2.3.6 (Age Assurance declared but absent). The client removal
-- shipped in PR 469, whose commit message deferred this half:
--
--     "The database migration (flag off, DROP POLICY public_feed_read) is
--      handled separately. /api/reflections/submit and /report stay deployed
--      but are no longer called by the app."
--
-- That migration was never written, so both surfaces are still live server-side:
--
--   * `public_feed_read` on public.reflections grants SELECT to ANY role —
--     including anon, since the policy names none — for today's public rows, and
--     20260719000300 left the `public_reflections` flag ON. No client can read
--     or write a public reflection any more, but the database can still serve
--     one, and functions/api/reflections/submit.js (still deployed; Cloudflare
--     Pages routes by file) can still write one with the service role.
--
--   * public.users.age_range / age_attested_at / age_source and
--     public.record_age_range() are still present, with EXECUTE still granted to
--     `authenticated`, even though the client code, the native
--     declared-age-range module and the entitlement were all deleted in PR 469.
--     Build 12 declares no age-range collection in PrivacyInfo.xcprivacy; this
--     makes that true at the database layer too.
--
-- DELIBERATELY RETAINED: feature_flags, banned_users, reports,
-- reflection_hearts, is_user_banned(), feature_enabled(), sync_heart_count() +
-- its trigger, accept_ugc_terms(), users.ugc_accepted_at,
-- reflections.removed_at/removed_reason/heart_count, the public-feed index, and
-- the hearts/reports/flags policies. submit.js reads feature_flags and
-- banned_users; report.js writes reports. Dropping them would turn two deployed
-- endpoints into 502s instead of clean refusals. Section 1 makes submit.js
-- refuse on its own flag check, which is the behaviour we want from it.
--
-- Forward-only + idempotent. Paired down migration in
-- 20260805000000_retire_public_reflections_age_gate.down.sql — read its header
-- first: the revert is schema-clean but NOT data-lossless.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Turn the public_reflections kill switch OFF
--
-- Written as an upsert rather than a bare UPDATE so the row is guaranteed to
-- exist AND be false even on a database where 20260719000100's seed never ran.
-- Mirrors the shape 20260719000300 used to turn it on.
--
-- This one statement closes both ends: feature_enabled('public_reflections')
-- goes false for the read policy in section 2, and submit.js checks the same
-- flag before inserting.
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, enabled)
VALUES ('public_reflections', false)
ON CONFLICT (key) DO UPDATE SET enabled = false;

-- ---------------------------------------------------------------------------
-- 2. Drop the public-feed read policy
--
-- Belt and braces with section 1: a flag flipped back on by accident in the
-- dashboard must not silently re-expose the feed, and with no policy there is
-- no public read path at all.
--
-- The own-row policies are UNTOUCHED — own_select / own_insert / own_delete from
-- 20260719000000 and own_update_private from 20260719000400 — so the private
-- journal, which is the reflections feature that still ships, keeps working
-- exactly as before. (SELECT policies are OR'd, so removing this one only
-- removes the public grant.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_feed_read" ON public.reflections;

-- ---------------------------------------------------------------------------
-- 3. Remove the age gate
--
-- This is the rollback documented at the bottom of
-- 20260721000200_age_range.sql, run verbatim. Dropping the function also drops
-- its GRANT EXECUTE ... TO authenticated. The explicit constraint drops are
-- redundant with DROP COLUMN (which cascades the CHECKs) but are kept so this
-- matches the documented rollback line for line.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_age_range(text, text);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_age_range_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_age_source_check;

ALTER TABLE public.users DROP COLUMN IF EXISTS age_source;
ALTER TABLE public.users DROP COLUMN IF EXISTS age_attested_at;
ALTER TABLE public.users DROP COLUMN IF EXISTS age_range;
