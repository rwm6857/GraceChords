-- =============================================================================
-- GraceChords: client_errors — browser crash log (2026-11-05)
--
-- One row per distinct web crash (keyed by a fingerprint of name + message +
-- stack), with an occurrence count and first/last-seen times. Written ONLY by
-- the Pages Function apps/web/functions/api/client-error.js using the service
-- role, through log_client_error(). Read it in the Supabase dashboard (Table
-- Editor → client_errors, sorted by last_seen).
--
-- Access: RLS on with NO policies, and no grants to anon/authenticated, so the
-- browser can neither read nor write it. The RPC is executable by service_role
-- only.
--
-- Bounded: rows unseen for 90 days are pruned on each call, and once 5,000
-- distinct errors are stored, new fingerprints are dropped (existing ones still
-- count) so a flood of fake reports cannot grow the table without limit.
--
-- Contains no user ids, emails or content. Idempotent.
-- Revert: 20261105120000_client_errors.down.sql
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_errors (
  fingerprint      text PRIMARY KEY,
  name             text NOT NULL DEFAULT '',
  message          text NOT NULL DEFAULT '',
  stack            text NOT NULL DEFAULT '',
  component_stack  text NOT NULL DEFAULT '',
  source           text NOT NULL DEFAULT '',
  path             text NOT NULL DEFAULT '',
  user_agent       text NOT NULL DEFAULT '',
  release          text NOT NULL DEFAULT '',
  count            integer NOT NULL DEFAULT 1,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_errors_last_seen_idx
  ON public.client_errors (last_seen DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_errors TO service_role;

CREATE OR REPLACE FUNCTION public.log_client_error(
  p_fingerprint     text,
  p_name            text,
  p_message         text,
  p_stack           text,
  p_component_stack text,
  p_source          text,
  p_path            text,
  p_user_agent      text,
  p_release         text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.client_errors WHERE last_seen < now() - interval '90 days';

  UPDATE public.client_errors
     SET count = count + 1,
         last_seen = now(),
         path = left(coalesce(p_path, ''), 300),
         user_agent = left(coalesce(p_user_agent, ''), 300),
         release = left(coalesce(p_release, ''), 64)
   WHERE fingerprint = p_fingerprint;
  IF FOUND THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.client_errors) >= 5000 THEN
    RETURN;
  END IF;

  INSERT INTO public.client_errors AS ce
    (fingerprint, name, message, stack, component_stack, source, path, user_agent, release)
  VALUES (
    left(p_fingerprint, 64),
    left(coalesce(p_name, ''), 100),
    left(coalesce(p_message, ''), 500),
    left(coalesce(p_stack, ''), 4000),
    left(coalesce(p_component_stack, ''), 4000),
    left(coalesce(p_source, ''), 40),
    left(coalesce(p_path, ''), 300),
    left(coalesce(p_user_agent, ''), 300),
    left(coalesce(p_release, ''), 64)
  )
  ON CONFLICT (fingerprint) DO UPDATE
    SET count = ce.count + 1, last_seen = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text, text, text, text)
  TO service_role;

COMMIT;
