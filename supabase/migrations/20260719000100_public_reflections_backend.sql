-- =============================================================================
-- GraceChords: public reflections backend + moderation core (Phase 2A, 2026-07-19)
--
-- Backend + moderation foundation for PUBLIC reflections. NO client-facing feed,
-- compose, hearts, or report UI ships in this phase (that's 2B). By the end of
-- 2A: a public reflection can only enter the DB *after passing moderation* (the
-- submit path is a service-role Pages Function, never a client RLS insert), the
-- `public_reflections` kill switch works, and removing/banning is a one-row
-- admin action in the Supabase dashboard.
--
-- Design decisions baked in here:
--   * Public reads are gated by a today-only, not-removed, not-banned,
--     feature-on policy. The ban + flag checks go through SECURITY DEFINER
--     helpers (is_user_banned / feature_enabled) because banned_users has NO
--     client select policy — a plain subquery in an RLS policy would be silently
--     neutered by RLS on banned_users and let everyone through. SECURITY DEFINER
--     helpers run as owner and bypass that (they must still be GRANTed EXECUTE to
--     the invoking role — SECURITY DEFINER governs what runs, not who may call).
--   * heart_count is denormalized on reflections and maintained by a SECURITY
--     DEFINER trigger (reflections has no UPDATE policy, so a non-owner hearting
--     a post could not otherwise bump the count).
--   * Banning hides existing posts via the feed policy's is_user_banned check
--     (single source of truth) AND blocks new posts (the submit function checks
--     it); no trigger back-fills removed_at.
--   * There is NO public insert policy on reflections — the existing private-only
--     own_insert stays, so the ONLY way a visibility='public' row appears is the
--     submit Pages Function (service role), guaranteeing moderation always runs.
--
-- Forward-only + idempotent, per repo convention. Documented rollback at the
-- bottom of this file.
-- =============================================================================

-- ── Reflections: soft-delete + audit + denormalized heart count ──────────────
ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS removed_at     timestamptz;
ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS removed_reason text;
ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS heart_count    integer NOT NULL DEFAULT 0;

-- Partial index for the today-only public feed read.
CREATE INDEX IF NOT EXISTS reflections_public_feed_idx
  ON public.reflections (reflection_date)
  WHERE visibility = 'public' AND removed_at IS NULL;

-- ── Kill switch / feature flags: client-readable, admin(service-role)-writable ─
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key     text    PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.feature_flags(key, enabled) VALUES ('public_reflections', false)
  ON CONFLICT (key) DO NOTHING;

-- ── Bans (eject): a row blocks future posts and hides existing ones ──────────
CREATE TABLE IF NOT EXISTS public.banned_users (
  user_id   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason    text,
  banned_at timestamptz NOT NULL DEFAULT now()
);

-- ── Reports ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id uuid        NOT NULL REFERENCES public.reflections(id) ON DELETE CASCADE,
  reporter_id   uuid        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_reflection_id_idx ON public.reports (reflection_id);

-- ── Hearts: one per user per post, count maintained by trigger ───────────────
CREATE TABLE IF NOT EXISTS public.reflection_hearts (
  reflection_id uuid        NOT NULL REFERENCES public.reflections(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reflection_id, user_id)
);

-- ── SECURITY DEFINER helpers (bypass RLS on banned_users / feature_flags) ────
CREATE OR REPLACE FUNCTION public.is_user_banned(p_user uuid)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.banned_users b WHERE b.user_id = p_user)
$$;
CREATE OR REPLACE FUNCTION public.feature_enabled(p_key text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT COALESCE((SELECT f.enabled FROM public.feature_flags f WHERE f.key = p_key), false)
$$;
REVOKE ALL ON FUNCTION public.is_user_banned(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.feature_enabled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feature_enabled(text) TO anon, authenticated;

-- ── heart_count maintenance (SECURITY DEFINER: reflections has no UPDATE policy) ─
CREATE OR REPLACE FUNCTION public.sync_heart_count()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reflections SET heart_count = heart_count + 1 WHERE id = NEW.reflection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reflections SET heart_count = GREATEST(0, heart_count - 1) WHERE id = OLD.reflection_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_reflection_hearts_count ON public.reflection_hearts;
CREATE TRIGGER trg_reflection_hearts_count
  AFTER INSERT OR DELETE ON public.reflection_hearts
  FOR EACH ROW EXECUTE FUNCTION public.sync_heart_count();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.feature_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reflection_hearts ENABLE ROW LEVEL SECURITY;

-- feature_flags: everyone reads; no client write (admin writes via service role).
DROP POLICY IF EXISTS "flags_select_all" ON public.feature_flags;
CREATE POLICY "flags_select_all" ON public.feature_flags FOR SELECT USING (true);

-- banned_users: NO policies at all -> RLS denies every client op (service role
-- bypasses). Admin bans via the Supabase dashboard.

-- reports: insert own only; no client read (alerts fire from the report endpoint).
DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- reflections: additive public-feed read. The private own_select/own_insert/
-- own_delete policies from 20260719000000 stay untouched (SELECT policies OR, so
-- a user still sees their own rows via own_select).
DROP POLICY IF EXISTS "public_feed_read" ON public.reflections;
CREATE POLICY "public_feed_read" ON public.reflections FOR SELECT USING (
  visibility = 'public'
  AND removed_at IS NULL
  AND reflection_date = current_date
  AND public.feature_enabled('public_reflections')
  AND NOT public.is_user_banned(user_id)
);

-- reflection_hearts: insert own only, on a VISIBLE public post that is not the
-- user's own (self-heart blocked); dup blocked by the PK. Own select (so a user
-- knows their own heart state to toggle) — never other hearters. Own delete.
DROP POLICY IF EXISTS "hearts_insert_own" ON public.reflection_hearts;
DROP POLICY IF EXISTS "hearts_select_own" ON public.reflection_hearts;
DROP POLICY IF EXISTS "hearts_delete_own" ON public.reflection_hearts;
CREATE POLICY "hearts_insert_own" ON public.reflection_hearts FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.reflections r
    WHERE r.id = reflection_id
      AND r.visibility = 'public'
      AND r.removed_at IS NULL
      AND r.reflection_date = current_date
      AND r.user_id <> auth.uid()
      AND NOT public.is_user_banned(r.user_id)
      AND public.feature_enabled('public_reflections')
  )
);
CREATE POLICY "hearts_select_own" ON public.reflection_hearts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "hearts_delete_own" ON public.reflection_hearts FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   DROP POLICY IF EXISTS "hearts_delete_own"  ON public.reflection_hearts;
--   DROP POLICY IF EXISTS "hearts_select_own"  ON public.reflection_hearts;
--   DROP POLICY IF EXISTS "hearts_insert_own"  ON public.reflection_hearts;
--   DROP POLICY IF EXISTS "public_feed_read"   ON public.reflections;
--   DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
--   DROP POLICY IF EXISTS "flags_select_all"   ON public.feature_flags;
--   DROP TRIGGER IF EXISTS trg_reflection_hearts_count ON public.reflection_hearts;
--   DROP FUNCTION IF EXISTS public.sync_heart_count();
--   DROP FUNCTION IF EXISTS public.is_user_banned(uuid);
--   DROP FUNCTION IF EXISTS public.feature_enabled(text);
--   DROP TABLE IF EXISTS public.reflection_hearts;
--   DROP TABLE IF EXISTS public.reports;
--   DROP TABLE IF EXISTS public.banned_users;
--   DROP TABLE IF EXISTS public.feature_flags;
--   DROP INDEX IF EXISTS public.reflections_public_feed_idx;
--   ALTER TABLE public.reflections DROP COLUMN IF EXISTS heart_count;
--   ALTER TABLE public.reflections DROP COLUMN IF EXISTS removed_reason;
--   ALTER TABLE public.reflections DROP COLUMN IF EXISTS removed_at;
-- =============================================================================
