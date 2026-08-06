-- =============================================================================
-- GraceChords: codify public.users (2026-08-06)
--
-- public.users has never existed in a migration. It was provisioned out-of-band,
-- as 20260719000200:8-14 and 20260721000200:9-14 both state outright. Every other
-- migration that touches this table only ALTERs it; its columns, constraints,
-- indexes, policies, triggers and grants have lived nowhere but the live database.
--
-- This file reproduces the LIVE production state exactly. It is a no-op against
-- prod today and a faithful rebuild on a fresh database. Transcribed by hand from
-- live introspection on 2026-08-06. If re-running that introspection after this
-- file produces ANY diff, this file is wrong, not prod.
--
-- DELIBERATELY NOT CODIFIED: public.contributor_invites and
-- claim_contributor_invite(text). Both exist in prod and both are dead — the
-- function raises 42703 on every call, because it reads and writes a `global_role`
-- column that no longer exists. 20260806000100 drops them; codifying them here
-- would resurrect them on a fresh rebuild.
--
-- Idempotent. Run inside a single transaction. Paired down migration is
-- intentionally inert — read its header before running it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table. 10 live columns.
--
-- Live attnums skip 3, 4, 13, 14 and 15 — five dropped columns still holding
-- tombstones. 13/14/15 are age_range/age_attested_at/age_source, added by
-- 20260721000200 and dropped by 20260805000000. 3 and 4 were dropped long before
-- and their names are unrecoverable from the catalog; the evidence (see the
-- fossil references in 20260312_song_editor.sql, is_global_admin(), and
-- AuthCallbackPage.jsx:22) points to `email` and `global_role`.
--
-- A fresh CREATE cannot reproduce tombstones, and does not need to.
--
-- NOTE FOR READERS OF THE CLIENT CODE: there is NO `email` column.
-- apps/web/src/pages/AuthCallbackPage.jsx:22 upserts one, which is why that call
-- has always failed with PostgREST PGRST204. It is caught and logged non-fatally
-- at line 32. It is dead twice over: with no INSERT policy on this table, RLS
-- would reject the row anyway. handle_new_user() is the only provisioning path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                 uuid        NOT NULL,
  display_name       text,
  preferences        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  role               text        NOT NULL DEFAULT 'user'::text,
  account_created_at timestamptz NOT NULL DEFAULT now(),
  telegram_user_id   bigint,
  telegram_linked_at timestamptz,
  ugc_accepted_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- 2. Row-level security.
--
-- Enabled, NOT forced (relforcerowsecurity = false in prod), so the table owner
-- still bypasses RLS. Re-enabling an already-enabled table is a no-op.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Constraints.
--
-- Every guard filters on conrelid as well as conname. 20260721000200 checked
-- conname alone, which silently skips creation if any other table in the database
-- ever carries a same-named constraint.
--
-- users_role_check still includes 'collaborator' because that is the live state:
-- 20260708000000 retired the role everywhere except here. 20260806000300 narrows
-- it. Codifying the current five-value form keeps this file a snapshot rather
-- than an improvement.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.users'::regclass AND conname = 'users_pkey') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.users'::regclass AND conname = 'users_id_fkey') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.users'::regclass AND conname = 'users_role_check') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text,
                               'collaborator'::text, 'user'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.users'::regclass AND conname = 'users_telegram_user_id_key') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_telegram_user_id_key UNIQUE (telegram_user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes.
--
-- users_pkey and users_telegram_user_id_key are created implicitly by their
-- constraints in section 3. Only the partial index is explicit. It matches
-- 20260521000000_telegram_link.sql:26-28 exactly.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id
  ON public.users USING btree (telegram_user_id)
  WHERE (telegram_user_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 5. Functions, verbatim from pg_get_functiondef.
--
-- handle_new_user is the ONLY function in the database with
-- SET search_path TO 'public' rather than ''. Reproduced exactly rather than
-- "fixed": its body fully qualifies public.users, so the difference is inert, and
-- changing it here would stop this file being a no-op. Note that
-- 20260609020000:16-20 listed handle_new_user under "clean / correctly qualified
-- — no change needed", which was wrong on the search_path point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT role FROM public.users WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.has_min_role(min_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE public.get_user_role()
    WHEN 'owner'  THEN true
    WHEN 'admin'  THEN min_role IN ('admin','editor','user')
    WHEN 'editor' THEN min_role IN ('editor','user')
    WHEN 'user'   THEN min_role = 'user'
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- The hand-applied escalation fix. An authenticated user could PATCH their own
-- role because users_update's USING (id = auth.uid()) constrains WHICH ROW is
-- updated, never WHICH COLUMNS change. This blocks any role change that did not
-- come through update_user_role(), which sets the transaction-local flag below.
CREATE OR REPLACE FUNCTION public.guard_users_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND coalesce(current_setting('app.role_change_ok', true), '') <> '1' THEN
    RAISE EXCEPTION 'role can only be changed via update_user_role()';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'user'
  );
  RETURN NEW;
END;
$function$;

-- Hardened by hand in production: 'owner' is absent from the assignable list, so
-- the single owner can only be set by direct SQL. Sets app.role_change_ok so the
-- guard trigger above permits its UPDATE.
CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  caller_role         text := public.get_user_role();
  target_current_role text;
BEGIN
  IF new_role NOT IN ('admin','editor','user') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  SELECT role INTO target_current_role
  FROM public.users WHERE id = target_user_id;

  IF new_role = 'admin' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Insufficient privileges to assign role: %', new_role;
  END IF;

  IF caller_role = 'admin' AND new_role NOT IN ('editor','user') THEN
    RAISE EXCEPTION 'Admins can only assign editor or user roles';
  END IF;

  IF target_current_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot modify an owner account';
  END IF;

  PERFORM set_config('app.role_change_ok', '1', true);
  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  caller_role text := public.get_user_role();
BEGIN
  IF caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can delete user accounts';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account here';
  END IF;

  -- Deleting from auth.users cascades to public.users and everything that
  -- FK-references it on delete cascade (user_starred_songs, collaborator_requests, …).
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$function$;

-- delete_user() is not in the codification brief but is the self-service deletion
-- RPC called by ProfilePage.jsx:272 and mobile SettingsScreen.tsx:249, and it is
-- part of this table's surface. Note prod's body has NO
-- `delete from public.contributor_requests` line, unlike
-- 20240003_add_delete_user_function.sql:12 — that table never existed. Prod is
-- correct here and the repo file was not; this codifies prod.
CREATE OR REPLACE FUNCTION public.delete_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Function grants, matching live proacl exactly.
--
-- guard_users_role_change() and set_updated_at() keep the default PUBLIC EXECUTE
-- — live proacl carries the `=X/postgres` entry for both. Deliberately not
-- revoked: revoking would change live state, and neither is callable in a way
-- that matters (a trigger function invoked directly returns nothing useful).
--
-- CREATE OR REPLACE preserves an existing function's ACL, so these statements
-- matter only on a fresh rebuild. They are written out so the rebuild is correct.
-- ---------------------------------------------------------------------------
REVOKE ALL    ON FUNCTION public.get_user_role()                 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role()                 TO anon, authenticated, service_role;

REVOKE ALL    ON FUNCTION public.has_min_role(text)              FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_min_role(text)              TO anon, authenticated, service_role;

REVOKE ALL    ON FUNCTION public.handle_new_user()               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user()               TO service_role;

REVOKE ALL    ON FUNCTION public.update_user_role(uuid, text)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text)    TO authenticated, service_role;

REVOKE ALL    ON FUNCTION public.admin_delete_user(uuid)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid)         TO authenticated, service_role;

REVOKE ALL    ON FUNCTION public.delete_user()                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user()                   TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Triggers on public.users.
--
-- DROP + CREATE is deterministic and atomic inside this transaction, so the
-- definition is guaranteed to match rather than merely to exist.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS guard_users_role ON public.users;
CREATE TRIGGER guard_users_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_role_change();

-- ---------------------------------------------------------------------------
-- 8. The auth.users trigger.
--
-- auth.users is owned by supabase_auth_admin, so CREATE TRIGGER on it may require
-- privileges the migration role does not have. This is written as an existence
-- guard rather than DROP + CREATE for two reasons: the branch does not execute
-- against production, where the trigger already exists, so no elevated privilege
-- is needed today; and a DROP + CREATE that failed halfway would leave production
-- with no signup provisioning at all.
--
-- OUT-OF-BAND DEPENDENCY. On a fresh rebuild, if this raises
-- "must be owner of relation users", run the CREATE TRIGGER separately as the
-- Supabase dashboard owner role. It is not optional: without it no public.users
-- row is ever created for a new signup, and since there is no INSERT policy on
-- this table, nothing else can create one either.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname  = 'on_auth_user_created'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Policies — all six live policies, exactly as they are today.
--
-- Every one is PERMISSIVE, targets {public}, and has a NULL WITH CHECK. Three of
-- the six are redundant (permissive policies OR together, and each redundant one
-- is a single disjunct of a survivor); 20260806000200 removes them. They are
-- reproduced here so this file is a true snapshot rather than an improvement.
--
-- There is deliberately NO INSERT policy: handle_new_user() is SECURITY DEFINER
-- and is the only provisioning path. Do not add one.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select"
  ON public.users FOR SELECT TO public
  USING ((id = auth.uid()) OR public.has_min_role('admin'));

DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
CREATE POLICY "Users can read their own profile"
  ON public.users FOR SELECT TO public
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT TO public
  USING (public.has_min_role('admin'));

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update"
  ON public.users FOR UPDATE TO public
  USING ((id = auth.uid()) OR public.has_min_role('admin'));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE TO public
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_delete" ON public.users;
CREATE POLICY "users_delete"
  ON public.users FOR DELETE TO public
  USING (public.get_user_role() = 'owner');

-- ---------------------------------------------------------------------------
-- 10. Table grants.
--
-- Live state is all seven privileges to all three API roles — Supabase's
-- default-privilege bootstrap, never narrowed. 20260806000500 narrows it; here it
-- is codified as-is.
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE public.users TO anon, authenticated, service_role;
