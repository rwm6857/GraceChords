-- =============================================================================
-- GraceChords: enable the public_reflections kill switch (2026-07-19)
--
-- Phase 2A/2B shipped the public "Shared Reflections" feed, compose, hearts, and
-- moderation behind the `public_reflections` feature flag, which shipped OFF so
-- nothing went live until moderation was ready. This migration flips it ON so the
-- community feed + the composer's Public/Shared option render for clients.
--
-- Every server-side gate (the today-only/not-removed/not-banned/feature-on RLS
-- read policy, the moderated service-role submit path, the self-heart block) is
-- unchanged — this only turns the client surfaces on. To take the feature back
-- down without a migration, flip the row to enabled=false in the Supabase
-- dashboard (feature_flags).
--
-- Forward-only + idempotent, per repo convention.
-- =============================================================================

INSERT INTO public.feature_flags (key, enabled)
VALUES ('public_reflections', true)
ON CONFLICT (key) DO UPDATE SET enabled = true;

-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   UPDATE public.feature_flags SET enabled = false WHERE key = 'public_reflections';
-- =============================================================================
