-- =============================================================================
-- DOWN migration for 20260806000100_drop_contributor_invite_deadcode.sql
--
-- Schema-clean, and data-lossless only because the dropped table was empty. If
-- rows had existed the up migration would have refused to run, so there is no
-- data to lose.
--
-- WARNING — THIS RE-OPENS A PUBLICLY READABLE TABLE.
--
-- Restoring contributor_invites restores its policy "Anyone can read an invite by
-- token" — qual `true`, cmd SELECT, roles {public} — together with anon's SELECT
-- grant. Any unauthenticated caller can then GET /rest/v1/contributor_invites and
-- read every row, `token` and `invited_email` included. That is reproduced
-- faithfully below because a down migration restores production as it was, not as
-- it should have been.
--
-- Only run this if the contributor-invite feature is genuinely being revived, and
-- if you do: rewrite that policy BEFORE inserting a single row. A correct version
-- would scope the read to the presented token rather than granting the whole
-- table, e.g. USING (token = current_setting('request.jwt.claims', true)::json
-- ->> 'invite_token') or, better, a SECURITY DEFINER lookup function.
--
-- The restored function is also still broken — see section 3.
--
-- Reverses in reverse order: table, then policies/grants, then the function.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The table.
--
-- Captured from live introspection on 2026-08-06, before the drop. Requires the
-- uuid-ossp (uuid_generate_v4) and pgcrypto (gen_random_bytes) extensions, both
-- of which are installed — the live column defaults below depended on them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contributor_invites (
  id            uuid        NOT NULL DEFAULT uuid_generate_v4(),
  token         text        NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'::text),
  invited_email text,
  invited_by    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  claimed_by    uuid,
  claimed_at    timestamptz
);

-- Both FKs are ON DELETE NO ACTION in the state being restored. Reproduced as-is
-- rather than "improved" to ON DELETE CASCADE: a down migration restores, it does
-- not fix. Be aware this reintroduces the hazard noted in the up migration — a
-- row here can block admin_delete_user() for the referenced user.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.contributor_invites'::regclass
                   AND conname  = 'contributor_invites_pkey') THEN
    ALTER TABLE public.contributor_invites
      ADD CONSTRAINT contributor_invites_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.contributor_invites'::regclass
                   AND conname  = 'contributor_invites_token_key') THEN
    ALTER TABLE public.contributor_invites
      ADD CONSTRAINT contributor_invites_token_key UNIQUE (token);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.contributor_invites'::regclass
                   AND conname  = 'contributor_invites_invited_by_fkey') THEN
    ALTER TABLE public.contributor_invites
      ADD CONSTRAINT contributor_invites_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES public.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.contributor_invites'::regclass
                   AND conname  = 'contributor_invites_claimed_by_fkey') THEN
    ALTER TABLE public.contributor_invites
      ADD CONSTRAINT contributor_invites_claimed_by_fkey
      FOREIGN KEY (claimed_by) REFERENCES public.users(id);
  END IF;
END $$;

-- Both live indexes (contributor_invites_pkey, contributor_invites_token_key) are
-- created implicitly by the PRIMARY KEY and UNIQUE constraints above. There were
-- no others.

-- ---------------------------------------------------------------------------
-- 2. RLS, policies and grants — the exposure, restored verbatim.
--
-- See the WARNING in the header. "Admins can manage invites" calls
-- is_global_admin(), which reads the dropped global_role column and therefore
-- raises 42703 whenever it is evaluated. That is why nobody ever noticed the
-- second policy: with an empty table the qual is never evaluated per-row, so a
-- SELECT just returns [] instead of erroring.
-- ---------------------------------------------------------------------------
ALTER TABLE public.contributor_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invites" ON public.contributor_invites;
CREATE POLICY "Admins can manage invites"
  ON public.contributor_invites FOR ALL TO public
  USING (public.is_global_admin());

DROP POLICY IF EXISTS "Anyone can read an invite by token" ON public.contributor_invites;
CREATE POLICY "Anyone can read an invite by token"
  ON public.contributor_invites FOR SELECT TO public
  USING (true);

GRANT ALL ON TABLE public.contributor_invites TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The function, verbatim from prod.
--
-- This is the ORIGINAL uncorrected body, complete with the `global_role`
-- references that make it raise 42703 on every call. Restoring the
-- corrected-but-never-applied version from 20260313_fix_function_search_paths.sql
-- would be a change, not a revert.
--
-- It compiles only because public.global_role still exists — the up migration
-- deliberately left that type in place for exactly this reason.
--
-- CREATED WITHOUT `SET search_path`, THEN ALTERed. This is not a stylistic
-- choice, it is the only order that works, and it is how production came to hold
-- this exact state in the first place.
--
-- plpgsql compiles the body at CREATE time with the function's own SET clauses
-- already applied. Under search_path = '' the unqualified `contributor_invites`
-- in the DECLARE block cannot resolve, and the CREATE fails outright with
-- `relation "contributor_invites" does not exist ... compilation of PL/pgSQL
-- function`. ALTER FUNCTION does not recompile the body, so setting search_path
-- afterwards sticks. That is precisely how prod ended up with a pre-20260313
-- body under search_path = '': 20260313 statement 13 never ran, and
-- 20260522000000:39's ALTER did.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_contributor_invite(invite_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  invite contributor_invites%rowtype;
  current_role global_role;
begin
  select * into invite
  from contributor_invites
  where token = invite_token;

  if not found then
    return 'invalid_token';
  end if;

  if invite.claimed_by is not null then
    return 'already_claimed';
  end if;

  if invite.expires_at is not null and invite.expires_at < now() then
    return 'expired';
  end if;

  select global_role into current_role
  from public.users
  where id = auth.uid();

  if current_role is not null then
    return 'already_contributor';
  end if;

  update contributor_invites
  set claimed_by = auth.uid(),
      claimed_at = now()
  where id = invite.id;

  update public.users
  set global_role = 'contributor'
  where id = auth.uid();

  return 'claimed';
end;
$function$;

-- Now pin the search_path, matching the live definition. Safe here because ALTER
-- does not recompile the body — see the note above.
ALTER FUNCTION public.claim_contributor_invite(text) SET search_path TO '';

REVOKE ALL    ON FUNCTION public.claim_contributor_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_contributor_invite(text) TO authenticated, service_role;
