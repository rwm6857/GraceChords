-- =============================================================================
-- GraceChords: Setlist & Teams schema redesign (2026-03-16)
--
-- Drops: saved_sets, team_role enum
-- Creates: teams, team_members, setlists (fresh), setlist_songs (fresh),
--          setlist_comments
-- Includes: limit-enforcement triggers, updated_at triggers, RLS policies
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. DROP OLD OBJECTS
-- ---------------------------------------------------------------------------

-- Drop functions that reference saved_sets so the table can be dropped cleanly
DROP FUNCTION IF EXISTS public.enforce_set_limit();
DROP FUNCTION IF EXISTS public.get_set_limit(text);

-- Drop old table
DROP TABLE IF EXISTS public.saved_sets CASCADE;

-- Drop enum type (only existed in some environments)
DROP TYPE IF EXISTS public.team_role;

-- Drop tables we are recreating (in reverse-dependency order)
DROP TABLE IF EXISTS public.setlist_comments  CASCADE;
DROP TABLE IF EXISTS public.setlist_songs     CASCADE;
DROP TABLE IF EXISTS public.setlists          CASCADE;
DROP TABLE IF EXISTS public.team_members      CASCADE;
DROP TABLE IF EXISTS public.teams             CASCADE;


-- ---------------------------------------------------------------------------
-- 1. TEAMS
-- ---------------------------------------------------------------------------
CREATE TABLE public.teams (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  color       text        NOT NULL
                          CHECK (color IN (
                            '#E07B54','#E8C547','#4CAF82',
                            '#4A90D9','#9B6DD6','#E05C7A','#7B8FA1'
                          )),
  created_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 2. TEAM_MEMBERS
-- ---------------------------------------------------------------------------
CREATE TABLE public.team_members (
  team_id    uuid        NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('leader', 'member')),
  joined_at  timestamptz DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX team_members_user_id_idx ON public.team_members (user_id);


-- ---------------------------------------------------------------------------
-- 3. SETLISTS
-- ---------------------------------------------------------------------------
CREATE TABLE public.setlists (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  team_id      uuid        REFERENCES public.teams(id)         ON DELETE CASCADE,
  name         text        NOT NULL,
  service_date date,
  notes        text,
  edit_mode    text        NOT NULL DEFAULT 'suggest'
                           CHECK (edit_mode IN ('edit', 'suggest')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX setlists_owner_id_idx ON public.setlists (owner_id);
CREATE INDEX setlists_team_id_idx  ON public.setlists (team_id);


-- ---------------------------------------------------------------------------
-- 4. SETLIST_SONGS
-- ---------------------------------------------------------------------------
CREATE TABLE public.setlist_songs (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id   uuid  NOT NULL REFERENCES public.setlists(id) ON DELETE CASCADE,
  song_id      uuid  NOT NULL REFERENCES public.songs(id)    ON DELETE CASCADE,
  position     int4  NOT NULL,
  key_override text,
  notes        text
);

CREATE INDEX setlist_songs_setlist_id_idx ON public.setlist_songs (setlist_id);


-- ---------------------------------------------------------------------------
-- 5. SETLIST_COMMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE public.setlist_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id  uuid        NOT NULL REFERENCES public.setlists(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  body        text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX setlist_comments_setlist_id_idx ON public.setlist_comments (setlist_id);


-- ---------------------------------------------------------------------------
-- 6. TRIGGER FUNCTIONS
-- ---------------------------------------------------------------------------

-- 6a. Personal setlist limit
--     When team_id IS NULL, enforce per-role cap on personal setlists.
CREATE OR REPLACE FUNCTION public.check_personal_setlist_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role  text;
  v_limit int;
  v_count int;
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    RETURN NEW;  -- handled by team limit trigger
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = NEW.owner_id;

  v_limit := CASE v_role
    WHEN 'user'         THEN 3
    WHEN 'collaborator' THEN 5
    WHEN 'editor'       THEN 10
    WHEN 'admin'        THEN 20
    WHEN 'owner'        THEN 30
    ELSE 3
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.setlists
  WHERE owner_id = NEW.owner_id AND team_id IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PERSONAL_SETLIST_LIMIT_REACHED: limit % for role %', v_limit, v_role;
  END IF;

  RETURN NEW;
END;
$$;


-- 6b. Team setlist limit
--     When team_id IS NOT NULL, cap total setlists per team at 5.
CREATE OR REPLACE FUNCTION public.check_team_setlist_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.team_id IS NULL THEN
    RETURN NEW;  -- handled by personal limit trigger
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.setlists
  WHERE team_id = NEW.team_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'TEAM_SETLIST_LIMIT_REACHED: teams are limited to 5 setlists';
  END IF;

  RETURN NEW;
END;
$$;


-- 6c. Team membership limit
--     A user may belong to at most 3 teams total.
CREATE OR REPLACE FUNCTION public.check_team_membership_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.team_members
  WHERE user_id = NEW.user_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'TEAM_MEMBERSHIP_LIMIT_REACHED: users may belong to at most 3 teams';
  END IF;

  RETURN NEW;
END;
$$;


-- 6d. Team leader limit
--     A user may be leader of at most 1 team.
CREATE OR REPLACE FUNCTION public.check_team_leader_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.role <> 'leader' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members
  WHERE user_id = NEW.user_id AND role = 'leader';

  IF v_count >= 1 THEN
    RAISE EXCEPTION 'TEAM_LEADER_LIMIT_REACHED: users may lead at most 1 team';
  END IF;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. TRIGGERS
-- ---------------------------------------------------------------------------

-- updated_at — teams
--   Reuses the existing public.update_updated_at() function.
CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- updated_at — setlists
CREATE TRIGGER setlists_updated_at
  BEFORE UPDATE ON public.setlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Personal setlist limit (BEFORE INSERT on setlists)
CREATE TRIGGER trg_personal_setlist_limit
  BEFORE INSERT ON public.setlists
  FOR EACH ROW EXECUTE FUNCTION public.check_personal_setlist_limit();

-- Team setlist limit (BEFORE INSERT on setlists)
CREATE TRIGGER trg_team_setlist_limit
  BEFORE INSERT ON public.setlists
  FOR EACH ROW EXECUTE FUNCTION public.check_team_setlist_limit();

-- Team membership limit (BEFORE INSERT on team_members)
CREATE TRIGGER trg_team_membership_limit
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.check_team_membership_limit();

-- Team leader limit (BEFORE INSERT on team_members)
CREATE TRIGGER trg_team_leader_limit
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.check_team_leader_limit();


-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE public.teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_songs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_comments ENABLE ROW LEVEL SECURITY;


-- ── teams ──────────────────────────────────────────────────────────────────

-- SELECT: user is a member or leader of the team
CREATE POLICY "teams_select"
  ON public.teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = teams.id
        AND tm.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user (they become leader via separate team_members insert)
CREATE POLICY "teams_insert"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: team leader only
CREATE POLICY "teams_update"
  ON public.teams FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = teams.id
        AND tm.user_id = auth.uid()
        AND tm.role = 'leader'
    )
  );

-- DELETE: team leader only
CREATE POLICY "teams_delete"
  ON public.teams FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = teams.id
        AND tm.user_id = auth.uid()
        AND tm.role = 'leader'
    )
  );


-- ── team_members ────────────────────────────────────────────────────────────

-- SELECT: members can see other members of their own teams
CREATE POLICY "team_members_select"
  ON public.team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members self
      WHERE self.team_id = team_members.team_id
        AND self.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user (trigger enforces limits)
CREATE POLICY "team_members_insert"
  ON public.team_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: user removes themselves, OR leader removes any member of their team
CREATE POLICY "team_members_delete"
  ON public.team_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members leader
      WHERE leader.team_id = team_members.team_id
        AND leader.user_id = auth.uid()
        AND leader.role = 'leader'
    )
  );


-- ── setlists ────────────────────────────────────────────────────────────────

-- SELECT: owner, or team member
CREATE POLICY "setlists_select"
  ON public.setlists FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = setlists.team_id
          AND tm.user_id = auth.uid()
      )
    )
  );

-- INSERT: any authenticated user (triggers enforce limits)
CREATE POLICY "setlists_insert"
  ON public.setlists FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: owner, or team member when edit_mode = 'edit'
CREATE POLICY "setlists_update"
  ON public.setlists FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND edit_mode = 'edit'
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = setlists.team_id
          AND tm.user_id = auth.uid()
      )
    )
  );

-- DELETE: owner only
CREATE POLICY "setlists_delete"
  ON public.setlists FOR DELETE
  USING (owner_id = auth.uid());


-- ── setlist_songs ────────────────────────────────────────────────────────────
-- Helper: returns true when caller can VIEW the parent setlist

-- SELECT: same access as parent setlist
CREATE POLICY "setlist_songs_select"
  ON public.setlist_songs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = sl.team_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  );

-- INSERT / UPDATE / DELETE: same as setlist UPDATE rules
CREATE POLICY "setlist_songs_insert"
  ON public.setlist_songs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND sl.edit_mode = 'edit'
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = sl.team_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "setlist_songs_update"
  ON public.setlist_songs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND sl.edit_mode = 'edit'
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = sl.team_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "setlist_songs_delete"
  ON public.setlist_songs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_songs.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND sl.edit_mode = 'edit'
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = sl.team_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  );


-- ── setlist_comments ─────────────────────────────────────────────────────────

-- SELECT: same access as parent setlist
CREATE POLICY "setlist_comments_select"
  ON public.setlist_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_comments.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = sl.team_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  );

-- INSERT: authenticated and has access to setlist
CREATE POLICY "setlist_comments_insert"
  ON public.setlist_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.setlists sl
      WHERE sl.id = setlist_comments.setlist_id
        AND (
          sl.owner_id = auth.uid()
          OR (
            sl.team_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = sl.team_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  );

-- DELETE: comment owner only
CREATE POLICY "setlist_comments_delete"
  ON public.setlist_comments FOR DELETE
  USING (user_id = auth.uid());
