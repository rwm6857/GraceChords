-- =============================================================================
-- GraceChords: collaborator_requests table (2026-03-07)
-- Stores requests from users wanting collaborator access.
-- Admins/owners can approve or deny via the Admin Portal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collaborator_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.collaborator_requests ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own request; admins can read/write all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'collaborator_requests'
      AND policyname = 'own_or_admin_request'
  ) THEN
    CREATE POLICY "own_or_admin_request"
      ON public.collaborator_requests
      FOR ALL
      USING (user_id = auth.uid() OR has_min_role('admin'));
  END IF;
END $$;

-- Index for fast lookup by status
CREATE INDEX IF NOT EXISTS collaborator_requests_status_idx
  ON public.collaborator_requests (status);

CREATE INDEX IF NOT EXISTS collaborator_requests_user_id_idx
  ON public.collaborator_requests (user_id);
