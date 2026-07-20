-- =============================================================================
-- GraceChords: live Sessions (Phase 1, 2026-07-20)
--
-- A worship leader starts a live session from an existing setlist and shares a
-- link; followers open https://gracechords.com/s/{code} on the web and their
-- view follows the leader in real time (current item + transpose). Sessions are
-- ephemeral and leader-live-only — they layer on top of setlists.
--
-- Design decisions baked in here:
--   * ONE row per session is the single source of truth. Followers subscribe to
--     that row via Supabase Realtime (postgres_changes); the late-join snapshot
--     and the live stream come from the same row.
--   * Exactly ONE writer: the native leader (controller_id = auth.uid()).
--     Everyone else — anon and other authed users — is a read-only subscriber.
--     Enforced at the data layer with RLS, not just in the UI.
--   * The session carries its OWN frozen snapshot of the item list in `items`
--     (jsonb). This is deliberate: (a) setlist_songs is persisted
--     wipe-and-replace, so setlist_songs.id is not a durable "current item" id;
--     and (b) setlists/setlist_songs are owner-scoped by RLS, so an anon
--     follower cannot read the setlist at all. The snapshot solves both — the
--     stable pointer is items[].uid, written to current_item_uid. Public song
--     lyrics are still resolved follower-side from the publicly-readable `songs`
--     catalog by slug; personal songs / bible verses are recorded as
--     `kind:'unavailable'` placeholders (no lyric embedding) in phase 1.
--   * Session code is FRESH PER SESSION (UNIQUE). The code's existence == the
--     session is live; old codes die with the session (cleanup worker deletes).
--   * controller_id is modeled as a single column now so co-leading / handoff is
--     a later additive change, not a refactor.
--
-- Realtime: the table is added to the supabase_realtime publication and set to
-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry the full row for
-- follower-side filtering. Realtime respects RLS via the SELECT policy below.
--
-- Forward-only + idempotent, per repo convention. Documented rollback + RLS
-- verification SQL at the bottom of this file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL UNIQUE,          -- fresh per session
  setlist_id       uuid        REFERENCES public.setlists(id) ON DELETE SET NULL,
  controller_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'live'
                               CHECK (status IN ('live', 'ended')),
  items            jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- frozen snapshot
  current_item_uid text,                                     -- points into items[].uid
  transpose        int         NOT NULL DEFAULT 0,           -- semitones for current item
  current_key      text,                                     -- optional effective-key display
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  last_active_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_code_idx        ON public.sessions (code);
CREATE INDEX        IF NOT EXISTS sessions_controller_idx  ON public.sessions (controller_id);
CREATE INDEX        IF NOT EXISTS sessions_status_active_idx ON public.sessions (status, last_active_at);


-- ---------------------------------------------------------------------------
-- 2. updated_at TRIGGER (reuses the shared public.update_updated_at() fn)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sessions_updated_at ON public.sessions;
CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--    controller_id may INSERT/UPDATE; anon + authed may SELECT; nobody else can
--    write. No DELETE policy -> no client (anon or authed) can delete; the
--    cleanup worker uses the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone (anon + authed). The client filters by `code`. Ended rows stay
-- readable so late/lingering followers can render the end screen.
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT USING (true);

-- INSERT: an authenticated user, only as themselves (controller_id = auth.uid()).
DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT WITH CHECK (controller_id = auth.uid());

-- UPDATE: only the controller; the WITH CHECK forbids reassigning controller_id
-- away from self, so a session can never be hijacked by rewriting the column.
DROP POLICY IF EXISTS "sessions_update" ON public.sessions;
CREATE POLICY "sessions_update" ON public.sessions
  FOR UPDATE
  USING (controller_id = auth.uid())
  WITH CHECK (controller_id = auth.uid());

-- (No DELETE policy on purpose.)


-- ---------------------------------------------------------------------------
-- 4. REALTIME
--    Full row in change payloads (filtering + RLS on old records), and add the
--    table to the realtime publication. Guarded so the migration is re-runnable.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;
END $$;


-- =============================================================================
-- RLS VERIFICATION (run manually in the Supabase SQL editor after seeding a row)
-- Replace <CODE> and <OTHER_USER_UUID>. Each mutation must fail or affect 0 rows.
--
--   -- Seed a controlled row as the service role (bypasses RLS):
--   -- INSERT INTO public.sessions (code, controller_id) VALUES ('TEST01', '<CONTROLLER_UUID>');
--
--   -- As anon: can read, cannot write.
--   SET request.jwt.claims = '{"role":"anon"}';
--   SET ROLE anon;
--   SELECT id, code, status FROM public.sessions WHERE code = '<CODE>';                       -- expect: 1 row
--   INSERT INTO public.sessions (code, controller_id) VALUES ('HACK01', gen_random_uuid());   -- expect: RLS violation
--   UPDATE public.sessions SET status = 'ended' WHERE code = '<CODE>';                        -- expect: 0 rows
--   DELETE FROM public.sessions WHERE code = '<CODE>';                                        -- expect: 0 rows
--   RESET ROLE;
--
--   -- As a DIFFERENT authenticated user (not the controller): cannot write.
--   SET request.jwt.claims = '{"sub":"<OTHER_USER_UUID>","role":"authenticated"}';
--   SET ROLE authenticated;
--   UPDATE public.sessions SET transpose = 2 WHERE code = '<CODE>';                           -- expect: 0 rows
--   RESET ROLE;
--
--   -- Confirm realtime is publishing the table:
--   SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'sessions';                           -- expect: 1 row
-- =============================================================================


-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   DO $$
--   BEGIN
--     IF EXISTS (
--       SELECT 1 FROM pg_publication_tables
--       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sessions'
--     ) THEN
--       ALTER PUBLICATION supabase_realtime DROP TABLE public.sessions;
--     END IF;
--   END $$;
--   DROP POLICY  IF EXISTS "sessions_update"   ON public.sessions;
--   DROP POLICY  IF EXISTS "sessions_insert"   ON public.sessions;
--   DROP POLICY  IF EXISTS "sessions_select"   ON public.sessions;
--   DROP TRIGGER IF EXISTS sessions_updated_at ON public.sessions;
--   DROP TABLE   IF EXISTS public.sessions;
-- =============================================================================
